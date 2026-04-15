import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractCodigo,
  extractDescricao,
  extractSku,
  getClickUpListId,
  getClickUpToken,
  mapTaskStatus,
  normalizeEmpresa,
} from './_clickup';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const empresa = normalizeEmpresa(req.query.empresa);
  const token = getClickUpToken(empresa);
  const listId = getClickUpListId(empresa, 'compras');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!token) {
    return res.status(500).json({
      error: 'Token nao configurado',
      empresa,
      expectedEnv: empresa === 'NEWSHOP'
        ? ['CLICKUP_TOKEN', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_NEWSHOP']
        : ['CLICKUP_TOKEN_SF', 'CLICKUP_API_TOKEN_SF', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_SF'],
    });
  }

  try {
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
    const produtos: any[] = [];
    const skippedTasks: Array<{ id: string; reason: string }> = [];

    for (const task of tasks) {
      if (!task || typeof task !== 'object') {
        skippedTasks.push({ id: '', reason: 'task-invalida' });
        continue;
      }

      try {
        const t = task as Record<string, any>;
        const produto = {
          id: String(t.id ?? ''),
          codigo: extractCodigo(t.name),
          sku: extractSku(t.name),
          descricao: extractDescricao(t.name),
          foto: extractFirstImageUrl(t.attachments),
          status: mapTaskStatus(t.status?.status),
          date_created: String(t.date_created ?? ''),
        };

        if (!produto.id || !produto.codigo) {
          skippedTasks.push({ id: String(t.id ?? ''), reason: 'sem-id-ou-codigo' });
          continue;
        }

        produtos.push(produto);
      } catch (taskError) {
        skippedTasks.push({
          id: String((task as Record<string, any>).id ?? ''),
          reason: String(taskError),
        });
      }
    }

    if (skippedTasks.length > 0) {
      console.warn('[clickup-compras] tasks ignoradas:', {
        empresa,
        listId,
        skipped: skippedTasks.slice(0, 10),
        skippedCount: skippedTasks.length,
        totalTasks: tasks.length,
      });
    }

    return res.json({
      produtos,
      empresa,
      total: produtos.length,
      listId,
      skippedCount: skippedTasks.length,
    });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({
      error: String(error),
      empresa,
      listId,
      hasToken: Boolean(token),
    });
  }
}

