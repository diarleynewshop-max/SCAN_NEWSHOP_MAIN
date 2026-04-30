import { VercelRequest, VercelResponse } from '@vercel/node';

const LIST_ID =
  process.env.CLICKUP_LIST_ID_COMPRAS_NEWSHOP ||
  process.env.CLICKUP_LIST_ID_COMPRAS ||
  process.env.VITE_CLICKUP_LIST_ID_COMPRAS ||
  '901326684020';

const TOKEN =
  process.env.CLICKUP_TOKEN ||
  process.env.CLICKUP_API_TOKEN ||
  process.env.VITE_CLICKUP_API_TOKEN ||
  process.env.VITE_CLICKUP_TOKEN_NEWSHOP ||
  '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('=== DEBUG CLICKUP ===');
  console.log('TOKEN:', TOKEN ? `EXISTE (${TOKEN.length} chars)` : 'NÃO EXISTE');
  console.log('LIST_ID:', LIST_ID);
  console.log('====================');

  const debug: any = {
    tokenExiste: !!TOKEN,
    tokenTamanho: TOKEN ? TOKEN.length : 0,
    tokenPrefixo: TOKEN ? TOKEN.slice(0, 15) + '...' : 'NENHUM',
    listaId: LIST_ID,
  };

  if (!TOKEN) {
    debug.erro = '❌ TOKEN VAZIO!';
    debug.solucao = 'Adicionar CLICKUP_TOKEN no Vercel';
    console.log('❌ TOKEN VAZIO');
    return res.json(debug);
  }

  try {
    console.log('🔄 FazendoRequest para ClickUp...');
    
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${LIST_ID}/task?include_closed=false`,
      { 
        headers: { 
          'Authorization': TOKEN,
          'Content-Type': 'application/json'
        } 
      }
    );

    console.log('📡 Response Status:', response.status);
    debug.apiStatus = response.status;
    debug.apiOk = response.ok;

    if (!response.ok) {
      const errorText = await response.text();
      debug.apiErro = errorText;
      console.log('❌ Erro da API:', errorText);
      return res.json(debug);
    }

    const data = await response.json();
    const tasks = data.tasks || [];

    console.log('✅ Tasks encontradas:', tasks.length);
    debug.totalTasks = tasks.length;
    
    if (tasks.length > 0) {
      debug.primeiraTask = {
        id: tasks[0].id,
        name: tasks[0].name,
        status: tasks[0].status?.status,
        attachments: tasks[0].attachments?.length,
      };
      console.log('📋 Primeira task:', tasks[0].name);
    }

    return res.json(debug);
  } catch (error) {
    console.error('❌ Erro catch:', error);
    debug.erroCatch = String(error);
    return res.json(debug);
  }
}
