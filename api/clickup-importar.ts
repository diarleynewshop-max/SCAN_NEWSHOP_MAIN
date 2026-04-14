import { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { getClickUpListId, getClickUpToken, normalizeEmpresa } from './_clickup';

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
  const listId = getClickUpListId(empresaKey, 'compras');

  if (!token) {
    return res.status(500).json({ error: 'Token nao configurado' });
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

