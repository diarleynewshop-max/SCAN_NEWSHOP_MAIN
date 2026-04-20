import { VercelRequest, VercelResponse } from '@vercel/node';

const LIST_IDS: Record<string, Record<string, string>> = {
  NEWSHOP: { loja: '901325900510', cd: '901325900510', compras: '901326684020' },
  SOYE:    { loja: '901326607319', cd: '901326461924', compras: '901326684020' },
  FACIL:   { loja: '901326607320', cd: '901326461915', compras: '901326684020' },
};

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN!
    : process.env.CLICKUP_TOKEN_SF!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, empresa = 'NEWSHOP', flag = 'loja', taskId } = req.query as Record<string, string>;
  const token = getToken(empresa);

  try {
    if (action === 'buscar-tasks') {
  const listId = LIST_IDS[empresa]?.[flag] ?? '901325900510';
  console.log('empresa:', empresa, 'flag:', flag, 'listId:', listId, 'token:', token?.slice(0,20));
  
  const r = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false`,
    { headers: { Authorization: token } }
  );
  const d = await r.json();
  console.log('tasks retornadas:', JSON.stringify(
    (d.tasks ?? []).map((t: any) => ({ name: t.name, status: t.status?.status }))
  ));

  const tasks = (d.tasks ?? [])
    .filter((t: any) => t.status?.status?.toLowerCase() === 'analisado')
    .map((t: any) => ({
      id: t.id, name: t.name,
      status: t.status?.status ?? '',
      date_created: t.date_created ?? '',
      attachments: (t.attachments ?? []).map((a: any) => ({
        id: a.id, title: a.title ?? a.file_name ?? '',
        url: a.url, mimetype: a.mimetype ?? '',
      })),
    }));
  return res.status(200).json({ tasks });
}
    if (action === 'buscar-tasks-compras') {
      const listId = LIST_IDS[empresa]?.['compras'] ?? '901326684020';
      console.log('empresa:', empresa, 'lista compras:', listId, 'token:', token?.slice(0,20));
      
      const r = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false`,
        { headers: { Authorization: token } }
      );
      const d = await r.json();
      console.log('tasks de compras retornadas:', JSON.stringify(
        (d.tasks ?? []).map((t: any) => ({ name: t.name, status: t.status?.status }))
      ));

      const tasks = (d.tasks ?? [])
        .map((t: any) => ({
          id: t.id, name: t.name,
          status: t.status?.status ?? '',
          date_created: t.date_created ?? '',
          attachments: (t.attachments ?? []).map((a: any) => ({
            id: a.id, title: a.title ?? a.file_name ?? '',
            url: a.url, mimetype: a.mimetype ?? '',
          })),
        }));
      return res.status(200).json({ tasks });
    }
    if (action === 'baixar-json') {
      // Busca task completa com attachments
      const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: { Authorization: token },
      });
      const taskData = await r.json();
      const att = (taskData.attachments ?? []).find(
        (a: any) => (a.title ?? a.file_name ?? '').endsWith('.json') || a.mimetype === 'application/json'
      );
      if (!att) return res.status(404).json({ error: 'JSON não encontrado na task' });
      // Baixa o arquivo no servidor (sem CORS)
      const fileRes = await fetch(att.url, { headers: { Authorization: token } });
      const json = await fileRes.json();
      return res.status(200).json(json);
    }

    if (action === 'deletar-task') {
      if (!taskId) return res.status(400).json({ error: 'taskId obrigatório' });
      const r = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        method: 'DELETE', headers: { Authorization: token },
      });
      return res.status(200).json({ deleted: r.ok });
    }

    return res.status(400).json({ error: 'Action inválida' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
