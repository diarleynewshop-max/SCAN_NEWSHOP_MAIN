import { VercelRequest, VercelResponse } from '@vercel/node';

const LIST_ID = process.env.VITE_CLICKUP_LIST_ID_COMPRAS || '901326684020';
const TOKEN = process.env.VITE_CLICKUP_API_TOKEN;

function extrairCodigo(name: string): string {
  const match = name.match(/nao_tem_(\d+)/);
  return match ? match[1] : name;
}

function extrairSku(name: string): string | null {
  const match = name.match(/nao_tem_\d+_([^_\s]+)/);
  return match ? match[1] : null;
}

function getStatus(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'done' || s === 'completed') return 'comprado';
  if (s === 'analisado') return 'analisado';
  if (s === 'cancelled') return 'reprovado';
  return 'novo';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== CLICKUP COMPRAS ===');
  console.log('TOKEN:', TOKEN ? `EXISTE (${TOKEN.length})` : 'NENHUM');
  console.log('LIST:', LIST_ID);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!TOKEN) {
    console.log('❌ TOKEN NÃO CONFIGURADO');
    return res.status(500).json({ error: 'Token não configurado' });
  }

  try {
    console.log('🔄 Buscando tasks...');
    
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${LIST_ID}/task?include_closed=false`,
      { headers: { Authorization: TOKEN } }
    );

    console.log('📡 Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Erro:', errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const tasks = data.tasks || [];

    console.log('✅ Tasks:', tasks.length);

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
          title.endsWith('.gif')
        )) {
          foto = url;
          break;
        }
      }

      return {
        id: t.id,
        codigo: extrairCodigo(t.name),
        sku: extrairSku(t.name),
        descricao: t.name,
        foto: foto,
        status: getStatus(t.status?.status),
        date_created: t.date_created,
      };
    }).filter((p: any) => p.codigo && p.codigo !== p.descricao);

    console.log('📦 Produtos processados:', produtos.length);
    
    return res.json({ produtos });
  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}