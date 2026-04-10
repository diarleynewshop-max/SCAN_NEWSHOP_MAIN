import { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

const TOKEN = process.env.VITE_CLICKUP_API_TOKEN;
const LIST_ID = process.env.VITE_CLICKUP_LIST_ID_COMPRAS || '901326684020';

interface ItemPlanilha {
  descricao: string;
  qtd: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!TOKEN) {
    return res.status(500).json({ error: 'Token não configurado' });
  }

  console.log('=== IMPORTAR PLANILHA ===');

  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_json<ItemPlanilha>(sheet);

    console.log('Linhas encontradas:', dados.length);

    if (dados.length === 0) {
      return res.status(400).json({ error: 'Planilha vazia' });
    }

    const resultados: { descricao: string; status: string; taskId?: string; erro?: string }[] = [];

    for (const item of dados) {
      const descricao = String(item.descricao || '').trim();
      
      if (!descricao) {
        console.log('⚠️ Descrição vazia, pulando');
        continue;
      }

      const nomeTask = `nao_tem_${descricao}`;

      console.log('📝 Criando task:', nomeTask);

      try {
        const createResponse = await fetch(
          `https://api.clickup.com/api/v2/list/${LIST_ID}/task`,
          {
            method: 'POST',
            headers: {
              'Authorization': TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: nomeTask,
              description: `QTD: ${item.qtd || ''}\n\nProduto importado da planilha`,
              status: 'open',
            }),
          }
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          console.log('❌ Erro ao criar:', errorText);
          resultados.push({ descricao, status: 'erro', erro: errorText });
          continue;
        }

        const taskData = await createResponse.json();
        console.log('✅ Task criada:', taskData.id);
        resultados.push({ descricao, status: 'criada', taskId: taskData.id });

      } catch (err) {
        console.log('❌ Erro:', err);
        resultados.push({ descricao, status: 'erro', erro: String(err) });
      }
    }

    const criadas = resultados.filter(r => r.status === 'criada').length;
    const erros = resultados.filter(r => r.status === 'erro').length;

    console.log(`=== FIM ===`);
    console.log(`Criadas: ${criadas}, Erros: ${erros}`);

    return res.json({
      sucesso: true,
      total: resultados.length,
      criadas,
      erros,
      detalhes: resultados,
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: String(error) });
  }
}