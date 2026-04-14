import { VercelRequest, VercelResponse } from '@vercel/node';

type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';

function normalizeEmpresa(value: unknown): EmpresaKey {
  const empresa = String(value ?? 'NEWSHOP').toUpperCase();
  if (empresa === 'SOYE' || empresa === 'FACIL') return empresa;
  return 'NEWSHOP';
}

function getClickUpToken(empresa: EmpresaKey): string {
  if (empresa === 'NEWSHOP') {
    return process.env.CLICKUP_TOKEN || process.env.CLICKUP_API_TOKEN || process.env.VITE_CLICKUP_API_TOKEN || process.env.VITE_CLICKUP_TOKEN_NEWSHOP || '';
  }

  return process.env.CLICKUP_TOKEN_SF || process.env.CLICKUP_API_TOKEN_SF || process.env.CLICKUP_API_TOKEN || process.env.VITE_CLICKUP_API_TOKEN || process.env.VITE_CLICKUP_TOKEN_SF || '';
}

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
    ANALISAR: 'analisado',
    APROVAR: 'done',
    REJEITAR: 'cancelled',
  };

  const novoStatus = statusMap[acaoUp];
  if (!novoStatus) {
    return res.status(400).json({ error: 'Use: ANALISAR, APROVAR ou REJEITAR' });
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

