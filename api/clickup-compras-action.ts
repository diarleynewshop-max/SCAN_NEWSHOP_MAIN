import { VercelRequest, VercelResponse } from '@vercel/node';

const STATUS_CLICKUP: Record<string, Record<string, string>> = {
  ANALISAR: { status: 'analisado' },
  APROVAR: { status: 'done' },
  REJEITAR: { status: 'cancelled' },
};

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN!
    : process.env.CLICKUP_TOKEN_SF!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { taskId, acao, empresa = 'NEWSHOP' } = req.body;

  if (!taskId || !acao) {
    return res.status(400).json({ error: 'taskId e ação são obrigatórios' });
  }

  const acaoValida = acao.toUpperCase();
  if (!STATUS_CLICKUP[acaoValida]) {
    return res.status(400).json({ error: 'Ação inválida. Use: ANALISAR, APROVAR ou REJEITAR' });
  }

  try {
    const token = getToken(empresa);
    const newStatus = STATUS_CLICKUP[acaoValida];

    console.log('🔄 Movendo task:', taskId, 'para:', newStatus);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStatus),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro do ClickUp:', errorText);
      return res.status(400).json({ error: 'Erro ao mover task', details: errorText });
    }

    console.log('✅ Task movida com sucesso');
    return res.status(200).json({ ok: true, taskId, acao: acaoValida.toLowerCase() });
  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}