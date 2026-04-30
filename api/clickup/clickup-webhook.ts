import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  mapTaskStatus,
  normalizeEmpresa,
} from './_clickup.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.CLICKUP_WEBHOOK_SECRET;

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

