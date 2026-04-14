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

function getComprasListId(empresa: EmpresaKey): string {
  if (empresa === 'NEWSHOP') {
    return process.env.CLICKUP_LIST_ID_COMPRAS_NEWSHOP || process.env.CLICKUP_LIST_ID_COMPRAS || process.env.VITE_CLICKUP_LIST_ID_COMPRAS || '901326684020';
  }
  if (empresa === 'SOYE') {
    return process.env.CLICKUP_LIST_ID_COMPRAS_SOYE || process.env.CLICKUP_LIST_ID_COMPRAS_SF || process.env.CLICKUP_LIST_ID_COMPRAS || process.env.VITE_CLICKUP_LIST_ID_COMPRAS || '901326684020';
  }
  return process.env.CLICKUP_LIST_ID_COMPRAS_FACIL || process.env.CLICKUP_LIST_ID_COMPRAS_SF || process.env.CLICKUP_LIST_ID_COMPRAS || process.env.VITE_CLICKUP_LIST_ID_COMPRAS || '901326684020';
}

function extractCodigo(name: string): string {
  const match = name.match(/nao_tem(?:_tudo)?_(\d+)/i);
  return match ? match[1] : name;
}

function extractSku(name: string): string | null {
  const match = name.match(/nao_tem(?:_tudo)?_\d+_([^_\s]+)/i);
  return match ? match[1] : null;
}

function extractDescricao(name: string): string {
  return name.replace(/^nao_tem_tudo_/i, '').replace(/^nao_tem_/i, '').trim();
}

function mapTaskStatus(status: string): 'novo' | 'analisado' | 'comprado' | 'reprovado' {
  const value = status?.toLowerCase();
  if (value === 'done' || value === 'completed') return 'comprado';
  if (value === 'analisado') return 'analisado';
  if (value === 'cancelled' || value === 'reprovado') return 'reprovado';
  return 'novo';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const empresa = normalizeEmpresa(req.query.empresa);
  const token = getClickUpToken(empresa);
  const listId = getComprasListId(empresa);

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
    const tasks = data.tasks || [];

    const produtos = tasks.map((t: any) => {
      const attachments = t.attachments || [];
      let foto = null;

      for (const a of attachments) {
        const url = a.url || '';
        const title = (a.title || a.file_name || '').toLowerCase();
        if (url.startsWith('http') && (
          a.mimetype?.startsWith('image/') ||
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
        id: t.id,
        codigo: extractCodigo(t.name),
        sku: extractSku(t.name),
        descricao: extractDescricao(t.name),
        foto,
        status: mapTaskStatus(t.status?.status),
        date_created: t.date_created,
      };
    }).filter((p: any) => p.codigo);

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

