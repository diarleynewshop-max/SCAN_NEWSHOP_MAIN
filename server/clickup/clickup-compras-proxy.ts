import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractCodigo,
  extractDescricao,
  extractSku,
  getCompraStatusCandidates,
  getClickUpListId,
  getClickUpToken,
  isCompraTransitionAllowed,
  mapActionToStatus,
  mapTaskStatus,
  normalizeEmpresa,
  resolveCompraClickUpStatus,
} from './_clickup.js';

type CompraStatusApp =
  | 'todo'
  | 'produto_bom'
  | 'produto_ruim'
  | 'fazer_pedido'
  | 'pedido_andamento'
  | 'compra_realizada'
  | 'concluido';

const CLICKUP_PAGE_SIZE = 100;
const MAX_CLICKUP_PAGES = 20;

function getSingle(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? '');
  }
  return String(value ?? '');
}

function normalizeStatusFilter(value: unknown): CompraStatusApp | null {
  const status = getSingle(value).trim().toLowerCase();

  if (
    status === 'todo' ||
    status === 'produto_bom' ||
    status === 'produto_ruim' ||
    status === 'fazer_pedido' ||
    status === 'pedido_andamento' ||
    status === 'compra_realizada' ||
    status === 'concluido'
  ) {
    return status;
  }

  return null;
}

function extractFirstImageUrl(attachments: unknown): string | null {
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const urlFields = ['thumbnail_url', 'thumbnailUrl', 'preview_url', 'previewUrl', 'download_url', 'downloadUrl', 'url'];

  for (const attachment of safeAttachments) {
    if (!attachment || typeof attachment !== 'object') continue;

    const candidate = attachment as Record<string, unknown>;
    const title = String(candidate.title || candidate.file_name || '').toLowerCase();
    const mimetype = String(candidate.mimetype || '');
    const isImageAttachment =
      mimetype.startsWith('image/') ||
      title.endsWith('.jpg') ||
      title.endsWith('.jpeg') ||
      title.endsWith('.png') ||
      title.endsWith('.gif') ||
      title.endsWith('.webp');

    for (const field of urlFields) {
      const url = String(candidate[field] || '');
      if (!url.startsWith('http')) continue;

      if (isImageAttachment || field.includes('thumbnail') || field.includes('preview') || (!mimetype && !title)) {
        return url;
      }
    }
  }

  return null;
}

function looksLikeImageUrl(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('image') ||
    normalized.includes('attachment') ||
    normalized.includes('clickup-attachments.com') ||
    normalized.includes('thumbnail') ||
    normalized.includes('preview') ||
    /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/.test(normalized)
  );
}

function extractImageUrlFromText(value: string): string | null {
  const urls = value.match(/https?:\/\/[^\s"'<>)]*/g) || [];

  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[.,;]+$/, '');
    if (looksLikeImageUrl(url)) return url;
  }

  return null;
}

function findImageUrlDeep(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;

  if (typeof value === 'string') {
    if (value.startsWith('http') && looksLikeImageUrl(value)) return value;
    return extractImageUrlFromText(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrlDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    'thumbnail_url',
    'thumbnailUrl',
    'preview_url',
    'previewUrl',
    'download_url',
    'downloadUrl',
    'coverimage',
    'cover_image',
    'image_url',
    'imageUrl',
    'thumbnail',
    'preview',
    'url',
  ];

  for (const key of preferredKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.startsWith('http') && looksLikeImageUrl(candidate)) {
      return candidate;
    }
  }

  for (const [key, candidate] of Object.entries(record)) {
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      const context = key.toLowerCase();
      if (context.includes('image') || context.includes('thumb') || context.includes('preview') || looksLikeImageUrl(candidate)) {
        return candidate;
      }
    }

    const found = findImageUrlDeep(candidate, depth + 1);
    if (found) return found;
  }

  return null;
}

function extractImageFromTask(task: Record<string, unknown>): string | null {
  const fromAttachments = extractFirstImageUrl(task.attachments);
  if (fromAttachments) return fromAttachments;

  const directFields = [
    task.coverimage,
    task.cover_image,
    task.image,
    task.image_url,
    task.thumbnail,
    task.thumbnail_url,
  ];

  for (const value of directFields) {
    if (typeof value === 'string' && value.startsWith('http')) return value;
  }

  return findImageUrlDeep(task);
}

function detectImageMime(buffer: Buffer, contentType: string): string | null {
  const mimeType = contentType.split(';')[0]?.trim();
  if (mimeType?.startsWith('image/')) return mimeType;

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

async function fetchImageAsDataUrl(url: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: 'image/*,*/*',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = detectImageMime(buffer, contentType);
    if (!mimeType) return null;

    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function getAction(req: VercelRequest): string {
  const actionQuery = getSingle(req.query.action).trim();
  const actionBody = getSingle((req.body as Record<string, unknown> | undefined)?.action).trim();
  return (actionQuery || actionBody || 'buscar-tasks').toLowerCase();
}

function getClickUpStatusName(status: unknown): string {
  if (!status || typeof status !== 'object') return '';
  return String((status as Record<string, unknown>).status ?? '');
}

async function fetchAllCompraTasks(token: string, listId: string) {
  const allTasks: unknown[] = [];

  for (let page = 0; page < MAX_CLICKUP_PAGES; page++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&page=${page}`,
        {
          headers: { Authorization: token },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ClickUp ${response.status} na lista ${listId}: ${errorText}`);
      }

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : {};
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      allTasks.push(...tasks);

      if (tasks.length < CLICKUP_PAGE_SIZE) break;
    } finally {
      clearTimeout(timeout);
    }
  }

  return allTasks;
}

async function buscarTasksCompras(
  req: VercelRequest,
  res: VercelResponse,
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL',
  token: string,
  listId: string
) {
  const statusFilter = normalizeStatusFilter(req.query.status);
  const tasks = await fetchAllCompraTasks(token, listId);
  const produtos: Array<Record<string, unknown>> = [];
  const skippedTasks: Array<{ id: string; reason: string }> = [];

  for (const task of tasks) {
    if (!task || typeof task !== 'object') {
      skippedTasks.push({ id: '', reason: 'task-invalida' });
      continue;
    }

    try {
      const t = task as Record<string, unknown>;
      const id = String(t.id ?? '');
      if (!id) {
        skippedTasks.push({ id: '', reason: 'sem-id' });
        continue;
      }

      const descricao = extractDescricao(t.name);
      const codigo = (extractCodigo(t.name) || descricao || id).trim();

      produtos.push({
        id,
        codigo,
        sku: extractSku(t.name),
        descricao,
        foto: extractFirstImageUrl(t.attachments),
        status: mapTaskStatus(getClickUpStatusName(t.status)),
        status_clickup: getClickUpStatusName(t.status),
        date_created: String(t.date_created ?? ''),
      });
    } catch (taskError) {
      skippedTasks.push({
        id: String((task as Record<string, unknown>).id ?? ''),
        reason: String(taskError),
      });
    }
  }

  const produtosFiltrados = statusFilter
    ? produtos.filter((produto) => produto.status === statusFilter)
    : produtos;

  return res.json({
    produtos: produtosFiltrados,
    empresa,
    total: produtosFiltrados.length,
    totalRaw: tasks.length,
    listId,
    statusFilter,
    skippedCount: skippedTasks.length,
  });
}

async function moverStatusCompra(
  req: VercelRequest,
  res: VercelResponse,
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL',
  token: string,
  listId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const taskId = getSingle(body.taskId).trim();
  const acao = getSingle(body.acao).trim();
  const currentStatus = getSingle(body.currentStatus).trim().toLowerCase() || 'todo';

  if (!taskId || !acao) {
    return res.status(400).json({ error: 'taskId e acao sao obrigatorios' });
  }

  const acaoUp = acao.toUpperCase();
  const novoStatusApp = mapActionToStatus(acaoUp);

  if (!novoStatusApp) {
    return res.status(400).json({ error: 'Use: LIKE, DISLIKE, FAZER_PEDIDO, PEDIDO_ANDAMENTO, COMPRA_REALIZADA ou CONCLUIR' });
  }

  if (!isCompraTransitionAllowed(currentStatus, novoStatusApp)) {
    return res.status(409).json({
      error: 'Transicao invalida para o fluxo de compras',
      currentStatus,
      nextStatus: novoStatusApp,
      empresa,
    });
  }

  let availableStatuses: string[] = [];
  try {
    const listResponse = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: token },
    });
    if (listResponse.ok) {
      const listData = await listResponse.json();
      availableStatuses = Array.isArray(listData.statuses)
        ? listData.statuses
            .map((status: Record<string, unknown>) => String(status?.status ?? '').trim())
            .filter(Boolean)
        : [];
    }
  } catch {
    availableStatuses = [];
  }

  const novoStatus = resolveCompraClickUpStatus(novoStatusApp, availableStatuses);
  const aliases = getCompraStatusCandidates(novoStatusApp);
  const candidateStatuses = novoStatus
    ? [novoStatus, ...aliases.filter((alias) => alias.toLowerCase() !== novoStatus.toLowerCase())]
    : aliases;

  let statusAplicado: string | null = null;
  let ultimoErro = '';

  for (const statusCandidate of candidateStatuses) {
    const updateResponse = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: statusCandidate }),
      }
    );

    if (updateResponse.ok) {
      statusAplicado = statusCandidate;
      break;
    }

    ultimoErro = await updateResponse.text();
  }

  if (!statusAplicado) {
    return res.status(400).json({
      error: 'Nenhum status compativel encontrado na lista de compras',
      details: ultimoErro,
      requestedStatus: novoStatusApp,
      attemptedStatuses: candidateStatuses,
      availableStatuses,
      empresa,
      listId,
    });
  }

  return res.json({
    ok: true,
    taskId,
    acao: acaoUp.toLowerCase(),
    previousStatus: currentStatus,
    status: statusAplicado,
    statusApp: novoStatusApp,
    empresa,
  });
}

async function buscarFotoTask(
  req: VercelRequest,
  res: VercelResponse,
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL',
  token: string
) {
  const taskId = getSingle(req.query.taskId).trim();
  if (!taskId) {
    return res.status(400).json({ error: 'taskId obrigatorio' });
  }

  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: token },
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: await response.text(),
      empresa,
      taskId,
    });
  }

  const task = (await response.json()) as Record<string, unknown>;
  const imageUrl = extractImageFromTask(task);
  const dataUrl = imageUrl ? await fetchImageAsDataUrl(imageUrl, token) : null;
  const foto = dataUrl || imageUrl;
  const message = foto
    ? 'Foto encontrada no ClickUp'
    : 'Nenhuma foto encontrada nos anexos/campos da task do ClickUp';

  if (foto) {
    console.info('[clickup-compras][foto] Foto encontrada', {
      empresa,
      taskId,
      imageUrl,
      returnedAs: dataUrl ? 'data-url' : 'url',
    });
  } else {
    console.warn('[clickup-compras][foto] Sem foto na task', {
      empresa,
      taskId,
      taskName: typeof task.name === 'string' ? task.name : '',
    });
  }

  return res.json({
    taskId,
    foto,
    hasImage: Boolean(foto),
    source: 'clickup',
    imageUrl,
    message,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const empresa = normalizeEmpresa(getSingle(req.query.empresa) || getSingle((req.body as Record<string, unknown> | undefined)?.empresa));
  const action = getAction(req);

  try {
    if (action === 'buscar-tasks') {
      const token = getClickUpToken(empresa);
      const listId = getClickUpListId(empresa, 'compras');

      if (!token) {
        return res.status(500).json({
          error: 'Token nao configurado',
          empresa,
          expectedEnv: empresa === 'NEWSHOP'
            ? ['CLICKUP_TOKEN', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_NEWSHOP']
            : ['CLICKUP_TOKEN_SF', 'CLICKUP_API_TOKEN_SF', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_SF'],
        });
      }

      return await buscarTasksCompras(req, res, empresa, token, listId);
    }

    if (action === 'mover-status') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo nao permitido para mover-status' });
      }

      const token = getClickUpToken(empresa);
      const listId = getClickUpListId(empresa, 'compras');

      if (!token) {
        return res.status(500).json({
          error: 'Token nao configurado',
          empresa,
          expectedEnv: empresa === 'NEWSHOP'
            ? ['CLICKUP_TOKEN', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_NEWSHOP']
            : ['CLICKUP_TOKEN_SF', 'CLICKUP_API_TOKEN_SF', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_SF'],
        });
      }

      return await moverStatusCompra(req, res, empresa, token, listId);
    }

    if (action === 'buscar-foto') {
      const token = getClickUpToken(empresa);

      if (!token) {
        return res.status(500).json({
          error: 'Token nao configurado',
          empresa,
        });
      }

      return await buscarFotoTask(req, res, empresa, token);
    }

    return res.status(400).json({ error: 'Action invalida', action });
  } catch (error) {
    const listId = getClickUpListId(empresa, 'compras');
    console.error('Erro no clickup-compras-proxy:', error);
    return res.status(500).json({
      error: String(error),
      empresa,
      listId,
      action,
    });
  }
}
