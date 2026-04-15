import { VercelRequest, VercelResponse } from '@vercel/node';
import { getClickUpToken, normalizeEmpresa } from './_clickup.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const { taskId, acao, empresa } = req.body ?? {};
  const empresaKey = normalizeEmpresa(empresa);
  const token = getClickUpToken(empresaKey);

  if (!token) {
    return res.status(500).json({ error: 'Token nao configurado', empresa: empresaKey });
  }

  if (!taskId || !acao) {
    return res.status(400).json({ error: 'taskId e acao sao obrigatorios' });
  }

  const acaoUp = String(acao).toUpperCase();
  const statusMap: Record<string, string> = {
    LIKE: 'produto bom',
    DISLIKE: 'produto ruim',
    FAZER_PEDIDO: 'fazer pedido',
    CONCLUIR: 'concluido',
  };

  const novoStatus = statusMap[acaoUp];
  if (!novoStatus) {
    return res.status(400).json({ error: 'Use: LIKE, DISLIKE, FAZER_PEDIDO ou CONCLUIR' });
  }

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: 'POST',
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

    return res.json({ ok: true, taskId, acao: acaoUp.toLowerCase(), status: novoStatus, empresa: empresaKey });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}

