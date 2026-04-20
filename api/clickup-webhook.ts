import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  extractCodigo,
  extractDescricao,
  extractSku,
  mapTaskStatus,
  normalizeEmpresa,
} from './_clickup.js';
import {
  isZimaComprasConfigured,
  postZimaCompraEvento,
  upsertZimaCompraTask,
} from './_zima-compras.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.CLICKUP_WEBHOOK_SECRET;

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

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString();
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Apenas POST' });

  if (WEBHOOK_SECRET) {
    const receivedSecret = req.query.secret as string;
    if (receivedSecret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const event = req.body ?? {};
  const eventosRelevantes = ['taskCreated', 'taskStatusUpdated', 'taskUpdated', 'taskDeleted'];

  if (!eventosRelevantes.includes(event?.event)) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const taskId = event.task_id ?? event.task?.id ?? event.history_items?.[0]?.task_id ?? null;
  const taskName = event.task?.name ?? event.task_name ?? null;
  const newStatus =
    event.history_items?.find((h: Record<string, unknown>) => h.field === 'status')?.after?.status ??
    event.task?.status?.status ??
    null;

  const empresa = normalizeEmpresa(
    event.empresa ??
    event.task?.custom_fields?.find(
      (field: Record<string, unknown>) => String(field?.name).toLowerCase() === 'empresa'
    )?.value
  );

  const payload: Record<string, unknown> = {
    event: event.event,
    task_id: taskId,
    task_name: taskName,
    empresa,
    timestamp: Date.now(),
  };

  if (newStatus) {
    payload.status_clickup = newStatus;
    payload.status_app = mapTaskStatus(newStatus);
  }

  if (isZimaComprasConfigured() && taskId) {
    try {
      if (event.event === 'taskDeleted') {
        await postZimaCompraEvento({
          task_id: String(taskId),
          empresa,
          acao: 'TASK_DELETED',
          origem: 'clickup-webhook',
          payload,
        });
      } else {
        await upsertZimaCompraTask({
          id: String(taskId),
          empresa,
          codigo: extractCodigo(taskName || taskId),
          sku: extractSku(taskName || taskId),
          descricao: extractDescricao(taskName || taskId),
          foto: extractFirstImageUrl(event.task?.attachments),
          status_app: newStatus ? mapTaskStatus(newStatus) : 'todo',
          status_clickup: newStatus ? String(newStatus) : null,
          date_created: toIsoString(event.task?.date_created),
          source: 'clickup-webhook',
        });
      }
    } catch (err) {
      console.error('Erro ao sincronizar webhook com ZimaOS:', err);
    }
  }

  try {
    const channel = supabase.channel('compras-sync');
    await channel.send({
      type: 'broadcast',
      event: 'clickup_update',
      payload,
    });
  } catch (err) {
    console.error('Erro ao broadcast Supabase:', err);
  }

  return res.status(200).json({ ok: true, received: event.event, task_id: taskId, empresa });
}

