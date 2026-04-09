import { VercelRequest, VercelResponse } from '@vercel/node';

const LIST_IDS: Record<string, string> = {
  NEWSHOP: '901326684020',
  SOYE: '901326684020',
  FACIL: '901326684020',
};

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN || ''
    : process.env.CLICKUP_TOKEN_SF || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const empresa = (req.query.empresa as string) || 'NEWSHOP';
  const listId = LIST_IDS[empresa] || '901326684020';
  const token = getToken(empresa);

  const debug: any = {
    empresa,
    listId,
    tokenExiste: !!token,
    tokenPrefix: token ? token.slice(0, 8) + '...' : 'NENHUM',
  };

  if (!token) {
    debug.erro = 'TOKEN NÃO CONFIGURADO!';
    return res.json(debug);
  }

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false`,
      { headers: { Authorization: token } }
    );

    debug.apiStatus = response.status;
    debug.apiOk = response.ok;

    if (!response.ok) {
      debug.apiErro = await response.text();
      return res.json(debug);
    }

    const data = await response.json();
    const tasks = data.tasks || [];

    debug.totalTasks = tasks.length;
    debug.primeiraTask = tasks[0] ? {
      id: tasks[0].id,
      name: tasks[0].name,
      status: tasks[0].status?.status,
      attachmentsCount: tasks[0].attachments?.length,
    } : null;

    return res.json(debug);
  } catch (error) {
    debug.erroCatch = String(error);
    return res.json(debug);
  }
}