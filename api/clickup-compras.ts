import { VercelRequest, VercelResponse } from '@vercel/node';

const LIST_IDS: Record<string, string> = {
  NEWSHOP: '901326684020',
  SOYE: '901326684020',
  FACIL: '901326684020',
};

const STATUS_MAP: Record<string, string> = {
  'to do': 'novo',
  'open': 'novo',
  'analisado': 'analisado',
  'done': 'comprado',
  'completed': 'comprado',
  'reprovado': 'reprovado',
  'cancelled': 'reprovado',
};

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN!
    : process.env.CLICKUP_TOKEN_SF!;
}

function extrairCodigo(name: string): string {
  const match = name.match(/nao_tem_(\d+)/);
  return match ? match[1] : name;
}

function extrairSku(name: string): string | null {
  const match = name.match(/nao_tem_\d+_([^_\s]+)/);
  return match ? match[1] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { empresa = 'NEWSHOP', status } = req.query as Record<string, string>;

  try {
    const listId = LIST_IDS[empresa] ?? '901326684020';
    const token = getToken(empresa);

    console.log('📥 Buscando produtos da lista:', listId, 'empresa:', empresa);

    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false`,
      { headers: { Authorization: token } }
    );

    const data = await response.json();
    const tasks = data.tasks ?? [];

    console.log('📦 Tasks encontradas:', tasks.length);

    const produtos = tasks
      .filter((t: any) => {
        const taskStatus = t.status?.status?.toLowerCase() ?? 'open';
        if (status && status !== 'all') {
          const mapped = STATUS_MAP[taskStatus] ?? 'novo';
          return mapped === status;
        }
        return taskStatus !== 'done' && taskStatus !== 'completed';
      })
      .map((t: any) => {
        const taskStatus = t.status?.status?.toLowerCase() ?? 'open';
        const mappedStatus = STATUS_MAP[taskStatus] ?? 'novo';
        
        const imageAttachment = (t.attachments ?? []).find((a: any) => {
          const url = a.url ?? '';
          if (!url || url.length < 20) return false;
          if (url.startsWith('data:')) return false;
          if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
          const title = a.title ?? a.file_name ?? '';
          const isImage = a.mimetype?.startsWith('image/') || 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(title);
          return isImage;
        });

        return {
          id: t.id,
          codigo: extrairCodigo(t.name),
          sku: extrairSku(t.name),
          descricao: t.name,
          foto: imageAttachment?.url ?? null,
          status: mappedStatus,
          empresa,
          date_created: t.date_created,
        };
      })
      .filter((p: any) => p.codigo !== p.descricao);

    console.log('✅ Produtos processados:', produtos.length);

    return res.status(200).json({ produtos });
  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}