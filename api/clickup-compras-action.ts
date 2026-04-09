import { VercelRequest, VercelResponse } from '@vercel/node';

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN!
    : process.env.CLICKUP_TOKEN_SF!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { taskId, acao, empresa = 'NEWSHOP' } = req.body;

  if (!taskId || !acao) {
    return res.status(400).json({ error: 'taskId e ação são obrigatórios' });
  }

  const acaoUp = acao.toUpperCase();
  const statusMap: Record<string, string> = {
    'ANALISAR': 'analisado',
    'APROVAR': 'done',
    'REJEITAR': 'cancelled',
  };

  const novoStatus = statusMap[acaoUp];
  if (!novoStatus) {
    return res.status(400).json({ error: 'Use: ANALISAR, APROVAR ou REJEITAR' });
  }

  try {
    const token = getToken(empresa);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: novoStatus }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(400).json({ error: 'Erro ao mover', details: errorText });
    }

    return res.json({ ok: true, taskId, acao: acaoUp.toLowerCase(), status: novoStatus });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}