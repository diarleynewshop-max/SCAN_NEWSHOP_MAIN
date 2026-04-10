import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase (só usado como canal Realtime — sem tabelas de dados) ───────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role: pode publicar no canal
);

// ─── Segurança: valida o secret que você configura no painel do ClickUp ───────
const WEBHOOK_SECRET = process.env.CLICKUP_WEBHOOK_SECRET;

// ─── Mapeia status do ClickUp para os status do app ──────────────────────────
function mapStatus(clickupStatus: string): string {
  const s = (clickupStatus ?? '').toLowerCase();
  if (s === 'done' || s === 'completed') return 'comprado';
  if (s === 'analisado')                 return 'analisado';
  if (s === 'cancelled')                 return 'reprovado';
  return 'novo';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ─── CORS ────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Apenas POST' });

  // ─── Valida secret (opcional mas recomendado) ─────────────────────────────
  // O ClickUp envia o secret como query param: ?secret=SEU_SECRET
  if (WEBHOOK_SECRET) {
    const receivedSecret = req.query.secret as string;
    if (receivedSecret !== WEBHOOK_SECRET) {
      console.warn('⚠ Webhook secret inválido');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const event = req.body;

  console.log('📬 Webhook recebido:', {
    event_type: event?.event,
    task_id:    event?.task_id,
    history:    event?.history_items?.length,
  });

  // ─── Processa apenas eventos de task relevantes ───────────────────────────
  const EVENTOS_RELEVANTES = [
    'taskCreated',
    'taskStatusUpdated',
    'taskUpdated',
    'taskDeleted',
  ];

  if (!EVENTOS_RELEVANTES.includes(event?.event)) {
    console.log('ℹ Evento ignorado:', event?.event);
    return res.status(200).json({ ok: true, ignored: true });
  }

  // ─── Monta payload para o canal Realtime ──────────────────────────────────
  // O front vai usar esses dados para decidir se faz um refetch ou atualiza local
  const taskId    = event.task_id ?? event.task?.id;
  const taskName  = event.task?.name ?? null;
  const newStatus = event.history_items?.find((h: any) => h.field === 'status')?.after?.status ?? null;

  const payload: Record<string, unknown> = {
    event:     event.event,
    task_id:   taskId,
    task_name: taskName,
    timestamp: Date.now(),
  };

  // Se mudou status, inclui o status mapeado para o app
  if (newStatus) {
    payload.status_clickup = newStatus;
    payload.status_app     = mapStatus(newStatus);
  }

  // ─── Publica no canal Supabase Realtime ───────────────────────────────────
  // O front escuta este canal e faz refetch quando chega qualquer mensagem
  try {
    const channel = supabase.channel('compras-sync');
    await channel.send({
      type:    'broadcast',
      event:   'clickup_update',
      payload,
    });
    console.log('📡 Broadcast enviado:', payload);
  } catch (err) {
    // Não bloqueia a resposta ao ClickUp — ele precisa de 200 rápido
    console.error('❌ Erro ao broadcast Supabase:', err);
  }

  // ─── Responde 200 para o ClickUp ─────────────────────────────────────────
  // O ClickUp para de retentar se receber 200 em até 5s
  return res.status(200).json({ ok: true, received: event.event, task_id: taskId });
}
