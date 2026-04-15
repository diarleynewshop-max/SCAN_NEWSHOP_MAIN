import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractCodigo,
  extractDescricao,
  extractSku,
  getClickUpListId,
  getClickUpToken,
  mapTaskStatus,
  normalizeEmpresa,
} from './_clickup';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const empresa = normalizeEmpresa(req.query.empresa);
  const token = getClickUpToken(empresa);
  const listId = getClickUpListId(empresa, 'compras');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!token) {
    return res.status(500).json({
      error: 'Token nao configurado',
      empresa,
      expectedEnv: empresa === 'NEWSHOP'
        ? ['CLICKUP_TOKEN', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_NEWSHOP']
        : ['CLICKUP_TOKEN_SF', 'CLICKUP_API_TOKEN_SF', 'CLICKUP_API_TOKEN', 'VITE_CLICKUP_API_TOKEN', 'VITE_CLICKUP_TOKEN_SF'],
    });
  }

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true`,
      { headers: { Authorization: token } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText, empresa, listId });
    }

    const data = await response.json();
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    const produtos = tasks
      .filter((t: any) => t && typeof t === 'object')
      .map((t: any) => {
      const attachments = Array.isArray(t.attachments) ? t.attachments : [];
      let foto = null;

      for (const a of attachments) {
        if (!a || typeof a !== 'object') continue;

        const url = String(a.url || '');
        const title = String(a.title || a.file_name || '').toLowerCase();
        if (url.startsWith('http') && (
          String(a.mimetype || '').startsWith('image/') ||
          title.endsWith('.jpg') ||
          title.endsWith('.jpeg') ||
          title.endsWith('.png') ||
          title.endsWith('.gif') ||
          title.endsWith('.webp')
        )) {
          foto = url;
          break;
        }
      }

      return {
        id: String(t.id ?? ''),
        codigo: extractCodigo(t.name),
        sku: extractSku(t.name),
        descricao: extractDescricao(t.name),
        foto,
        status: mapTaskStatus(t.status?.status),
        date_created: String(t.date_created ?? ''),
      };
    })
      .filter((p: any) => p.id && p.codigo);

    return res.json({ produtos, empresa, total: produtos.length, listId });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({
      error: String(error),
      empresa,
      listId,
      hasToken: Boolean(token),
    });
  }
}

