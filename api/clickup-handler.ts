import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractCodigo,
  extractSku,
  getClickUpToken,
  normalizeEmpresa,
} from './_clickup.js';

const CLICKUP_LIST_COMPRAS = '901326684020';

const produtoCache = new Map<string, {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: string;
  empresa: string;
  receivedAt: number;
}>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query as Record<string, string>;

  try {
    if (action === 'webhook') {
      const body = req.body ?? {};
      const challenge = body.challenge;
      if (challenge) {
        return res.status(200).json({ challenge });
      }

      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      if (tasks.length === 0) {
        return res.status(200).json({ ok: true, message: 'No tasks' });
      }

      let added = 0;
      for (const task of tasks) {
        const taskName = task.name ?? '';
        const status = task.status?.status ?? 'open';
        const listId = task.list_id?.toString();

        if (listId !== CLICKUP_LIST_COMPRAS) continue;
        if (status.toLowerCase() !== 'to do') continue;

        produtoCache.set(task.id, {
          id: task.id,
          codigo: extractCodigo(taskName),
          sku: extractSku(taskName),
          descricao: taskName,
          foto: task.attachments?.[0]?.url ?? null,
          status: 'novo',
          empresa: normalizeEmpresa(body.empresa),
          receivedAt: Date.now(),
        });
        added++;
      }

      return res.status(200).json({ ok: true, added });
    }

    if (action === 'produtos') {
      const { status } = req.query as Record<string, string>;
      let produtos = Array.from(produtoCache.values());
      if (status && status !== 'all') {
        produtos = produtos.filter((p) => p.status === status);
      }
      return res.status(200).json({ produtos });
    }

    if (action === 'action') {
      const { taskId, novaAcao, empresa = 'NEWSHOP' } = req.body as Record<string, string>;
      const token = getClickUpToken(normalizeEmpresa(empresa));

      if (!taskId || !novaAcao) {
        return res.status(400).json({ error: 'taskId e action sao obrigatorios' });
      }

      if (!token) {
        return res.status(500).json({ error: 'Token nao configurado' });
      }

      let novoStatus: string;
      switch (novaAcao) {
        case 'analisar': novoStatus = 'analisado'; break;
        case 'aprovar': novoStatus = 'comprado'; break;
        case 'rejeitar': novoStatus = 'reprovado'; break;
        default: return res.status(400).json({ error: 'acao invalida' });
      }

      const updateRes = await fetch(
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

      if (!updateRes.ok) {
        const error = await updateRes.text();
        return res.status(400).json({ error: 'Erro ao mover task', details: error });
      }

      const produto = produtoCache.get(taskId);
      if (produto) {
        produto.status = novaAcao === 'analisar' ? 'analisado' :
          novaAcao === 'aprovar' ? 'comprado' : 'reprovado';
      }

      return res.status(200).json({ ok: true, action: novaAcao, status: novoStatus });
    }

    return res.status(400).json({ error: 'Acao invalida' });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}

