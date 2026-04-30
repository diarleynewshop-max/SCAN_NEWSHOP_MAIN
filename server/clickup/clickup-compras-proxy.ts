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

  for (const attachment of safeAttachments) {
    if (!attachment || typeof attachment !== 'object') continue;

    const candidate = attachment as Record<string, unknown>;
    const url = String(candidate.url || '');
    const title = String(candidate.title || candidate.file_name || '').toLowerCase();
    const mimetype = String(candidate.mimetype || '');

    if (
      url.startsWith('http') &&
      (
        mimetype.startsWith('image/') ||
        title.endsWith('.jpg') ||
        title.endsWith('.jpeg') ||
        title.endsWith('.png') ||
        title.endsWith('.gif') ||
        title.endsWith('.webp')
      )
    ) {
      return url;
    }
  }

  return null;
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

async function buscarTasksCompras(
  req: VercelRequest,
  res: VercelResponse,
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL',
  token: string,
  listId: string
) {
  const statusFilter = normalizeStatusFilter(req.query.status);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true`,
    {
      headers: { Authorization: token },
      signal: controller.signal,
    }
  );
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text();
    return res.status(response.status).json({ error: errorText, empresa, listId });
  }

  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) : {};
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
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
