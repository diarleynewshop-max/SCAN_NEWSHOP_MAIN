import { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

type EmpresaKey = 'NEWSHOP' | 'SOYE' | 'FACIL';

function normalizeEmpresa(value: unknown): EmpresaKey {
  const empresa = String(value ?? 'NEWSHOP').trim().toUpperCase();
  if (empresa.includes('SOYE')) return 'SOYE';
  if (empresa.includes('FACIL')) return 'FACIL';
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
    return process.env.CLICKUP_TODO_LIST_ID_SOYE || process.env.CLICKUP_LIST_ID_COMPRAS_SOYE || process.env.CLICKUP_LIST_ID_COMPRAS_SF || process.env.CLICKUP_TODO_LIST_ID_SF || '901326607319';
  }
  return process.env.CLICKUP_TODO_LIST_ID_FACIL || process.env.CLICKUP_LIST_ID_COMPRAS_FACIL || process.env.CLICKUP_LIST_ID_COMPRAS_SF || process.env.CLICKUP_TODO_LIST_ID_SF || '901326607320';
}

interface ItemPlanilha {
  descricao?: string;
  qtd?: string | number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const { base64, empresa } = req.body ?? {};
  const empresaKey = normalizeEmpresa(empresa);
  const token = getClickUpToken(empresaKey);
  const listId = getComprasListId(empresaKey);

  if (!token) {
    return res.status(500).json({ error: 'Token nao configurado', empresa: empresaKey });
  }

  try {
    if (!base64) {
      return res.status(400).json({ error: 'Arquivo nao enviado' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_json<ItemPlanilha>(sheet);

    if (dados.length === 0) {
      return res.status(400).json({ error: 'Planilha vazia' });
    }

    const resultados: { descricao: string; status: string; taskId?: string; erro?: string }[] = [];

    for (const item of dados) {
      const descricao = String(item.descricao || '').trim();
      if (!descricao) continue;

      const nomeTask = `nao_tem_${descricao}`;

      try {
        const createResponse = await fetch(
          `https://api.clickup.com/api/v2/list/${listId}/task`,
          {
            method: 'POST',
            headers: {
              Authorization: token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: nomeTask,
              description: `QTD: ${item.qtd || ''}\n\nProduto importado da planilha`,
              status: 'to do',
            }),
          }
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          resultados.push({ descricao, status: 'erro', erro: errorText });
          continue;
        }

        const taskData = await createResponse.json();
        resultados.push({ descricao, status: 'criada', taskId: taskData.id });
      } catch (err) {
        resultados.push({ descricao, status: 'erro', erro: String(err) });
      }
    }

    const criadas = resultados.filter((r) => r.status === 'criada').length;
    const erros = resultados.filter((r) => r.status === 'erro').length;

    return res.json({
      sucesso: true,
      empresa: empresaKey,
      total: resultados.length,
      criadas,
      erros,
      detalhes: resultados,
    });
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}

