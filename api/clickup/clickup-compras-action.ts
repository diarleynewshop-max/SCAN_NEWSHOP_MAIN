import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  getClickUpListId,
  getClickUpToken,
  isCompraTransitionAllowed,
  mapActionToStatus,
  normalizeEmpresa,
  resolveCompraClickUpStatus,
} from './_clickup.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const { taskId, acao, empresa, currentStatus } = req.body ?? {};
  const empresaKey = normalizeEmpresa(empresa);
  const token = getClickUpToken(empresaKey);
  const listId = getClickUpListId(empresaKey, 'compras');

  if (!token) {
    return res.status(500).json({ error: 'Token nao configurado', empresa: empresaKey });
  }

  if (!taskId || !acao) {
    return res.status(400).json({ error: 'taskId e acao sao obrigatorios' });
  }

  const acaoUp = String(acao).toUpperCase();
  const novoStatusApp = mapActionToStatus(acaoUp);
  if (!novoStatusApp) {
    return res.status(400).json({ error: 'Use: LIKE, DISLIKE, FAZER_PEDIDO ou CONCLUIR' });
  }

  const statusAtual = String(currentStatus ?? 'todo').trim().toLowerCase();
  if (!isCompraTransitionAllowed(statusAtual, novoStatusApp)) {
    return res.status(409).json({
      error: 'Transicao invalida para o fluxo de compras',
      currentStatus: statusAtual,
      nextStatus: novoStatusApp,
      empresa: empresaKey,
    });
  }

  try {
    const listResponse = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}`,
      {
        headers: { Authorization: token },
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return res.status(400).json({
        error: 'Nao foi possivel carregar os status da lista de compras',
        details: errorText,
        empresa: empresaKey,
        listId,
      });
    }

    const listData = await listResponse.json();
    const availableStatuses = Array.isArray(listData.statuses)
      ? listData.statuses
          .map((status: Record<string, unknown>) => String(status?.status ?? '').trim())
          .filter(Boolean)
      : [];

    const novoStatus = resolveCompraClickUpStatus(novoStatusApp, availableStatuses);

    if (!novoStatus) {
      return res.status(400).json({
        error: 'Nenhum status compativel encontrado na lista de compras',
        requestedStatus: novoStatusApp,
        availableStatuses,
        empresa: empresaKey,
        listId,
      });
    }

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: novoStatus }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(400).json({ error: 'Erro ao mover', details: errorText });
    }

    if (supabase) {
      try {
        const channel = supabase.channel('compras-sync');
        await channel.send({
          type: 'broadcast',
          event: 'clickup_update',
          payload: {
            event: 'taskStatusUpdated',
            source: 'clickup-compras-action',
            task_id: taskId,
            empresa: empresaKey,
            previous_status_app: statusAtual,
            status_app: novoStatusApp,
            status_clickup: novoStatus,
            timestamp: Date.now(),
          },
        });
      } catch (broadcastError) {
        console.error('Erro ao broadcast imediato de compras:', broadcastError);
      }
    }

    return res.json({
      ok: true,
      taskId,
      acao: acaoUp.toLowerCase(),
      previousStatus: statusAtual,
      status: novoStatus,
      statusApp: novoStatusApp,
      empresa: empresaKey,
    });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}

