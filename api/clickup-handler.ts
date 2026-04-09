import { VercelRequest, VercelResponse } from '@vercel/node';

const CLICKUP_LIST_COMPRAS = '901326684020';

const produtoCache = new Map<string, {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: string;
  empresa: string;
  receivedAt: number;
}>();

function getToken(empresa: string): string {
  return empresa === 'NEWSHOP'
    ? process.env.CLICKUP_TOKEN!
    : process.env.CLICKUP_TOKEN_SF!;
}

function extrairCodigoDaTask(name: string): string {
  const match = name.match(/nao_tem_(\d+)/);
  return match ? match[1] : name;
}

function extrairSkuDaTask(name: string): string | null {
  const match = name.match(/nao_tem_\d+_([^_\s]+)/);
  return match ? match[1] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query as Record<string, string>;

  try {
    if (action === 'webhook') {
      const body = await req.json();
      console.log('📥 Webhook recebido:', JSON.stringify(body, null, 2));

      const challenge = body.challenge;
      if (challenge) {
        return res.status(200).json({ challenge });
      }

      if (!body.tasks || !body.tasks.length) {
        return res.status(200).json({ ok: true, message: 'No tasks' });
      }

      let added = 0;
      for (const task of body.tasks) {
        const taskName = task.name ?? '';
        const status = task.status?.status ?? 'open';
        const listId = task.list_id?.toString();

        if (listId !== CLICKUP_LIST_COMPRAS) continue;
        if (status.toLowerCase() !== 'to do') continue;

        const codigo = extrairCodigoDaTask(taskName);
        const sku = extrairSkuDaTask(taskName);
        const foto = task.attachments?.[0]?.url ?? null;

        produtoCache.set(task.id, {
          id: task.id,
          codigo,
          sku,
          descricao: taskName,
          foto,
          status: 'novo',
          empresa: body.empresa ?? 'NEWSHOP',
          receivedAt: Date.now()
        });
        added++;
        console.log('✅ Produto adicionado:', codigo);
      }

      return res.status(200).json({ ok: true, added });
    }

    if (action === 'produtos') {
      const { status } = req.query as Record<string, string>;
      
      let produtos = Array.from(produtoCache.values());
      
      if (status && status !== 'all') {
        produtos = produtos.filter(p => p.status === status);
      }

      return res.status(200).json({ produtos });
    }

    if (action === 'action') {
      const { taskId, novaAcao, empresa = 'NEWSHOP' } = req.body as Record<string, string>;
      
      if (!taskId || !novaAcao) {
        return res.status(400).json({ error: 'taskId e action são obrigatórios' });
      }

      const token = getToken(empresa);

      let novoStatus: string;
      switch (novaAcao) {
        case 'analisar': novoStatus = 'analisado'; break;
        case 'aprovar': novoStatus = 'comprado'; break;
        case 'rejeitar': novoStatus = 'reprovado'; break;
        default: return res.status(400).json({ error: 'ação inválida' });
      }

      const updateRes = await fetch(
        `https://api.clickup.com/api/v2/task/${taskId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: novoStatus })
        }
      );

      if (!updateRes.ok) {
        const error = await updateRes.text();
        return res.status(400).json({ error: 'Erro ao mover task', details: error });
      }

      const produto = produtoCache.get(taskId);
      if (produto) {
        produto.status = novaAcao === 'analisar' ? 'analisado' : 
                        novaAcao === 'aprovar' ? 'comprado' : 'reprovado';
      }

      return res.status(200).json({ ok: true, action: novaAcao, status: novoStatus });
    }

    return res.status(400).json({ error: 'Ação inválida' });

  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}