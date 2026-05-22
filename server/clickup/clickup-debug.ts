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

const TOKEN_SF =
  process.env.CLICKUP_TOKEN_SF ||
  process.env.CLICKUP_API_TOKEN_SF ||
  '';

const LIST_SF_SOYE = '901326607319';

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

export async function handlerSF(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mostra qual env var está sendo usada para SF
  const tokenSfVar =
    process.env.CLICKUP_TOKEN_SF ? 'CLICKUP_TOKEN_SF' :
    process.env.CLICKUP_API_TOKEN_SF ? 'CLICKUP_API_TOKEN_SF' :
    process.env.CLICKUP_API_TOKEN ? 'CLICKUP_API_TOKEN (FALLBACK NEWSHOP - ERRADO!)' :
    process.env.VITE_CLICKUP_TOKEN_SF ? 'VITE_CLICKUP_TOKEN_SF' :
    'NENHUMA';

  const debug: Record<string, unknown> = {
    tokenSF_existe: !!TOKEN_SF,
    tokenSF_tamanho: TOKEN_SF.length,
    tokenSF_prefixo: TOKEN_SF ? TOKEN_SF.slice(0, 15) + '...' : 'NENHUM',
    tokenSF_var_usada: tokenSfVar,
    tokenNEWSHOP_existe: !!TOKEN,
    tokenSF_igual_NEWSHOP: TOKEN_SF && TOKEN ? TOKEN_SF === TOKEN : false,
  };

  if (!TOKEN_SF) {
    debug.diagnostico = '❌ CLICKUP_TOKEN_SF não configurado na Vercel';
    debug.solucao = 'Acesse Vercel → Project → Settings → Environment Variables → Adicione CLICKUP_TOKEN_SF';
    return res.json(debug);
  }

  if (TOKEN && TOKEN_SF === TOKEN) {
    debug.diagnostico = '⚠️ TOKEN_SF é igual ao NEWSHOP — token errado configurado';
    debug.solucao = 'O token SF deve ser o token da conta ClickUp do SOYE/FACIL, não do NEWSHOP';
    return res.json(debug);
  }

  // Testa o token SF contra a lista do SOYE
  try {
    const r = await fetch(
      `https://api.clickup.com/api/v2/list/${LIST_SF_SOYE}/task?page=0&include_closed=false`,
      { headers: { Authorization: TOKEN_SF } }
    );
    debug.apiStatus = r.status;
    debug.apiOk = r.ok;

    if (!r.ok) {
      const body = await r.text();
      debug.diagnostico = `❌ ClickUp retornou ${r.status} — token pode estar errado ou expirado`;
      debug.apiErro = body.slice(0, 300);
    } else {
      const data = await r.json() as { tasks?: unknown[] };
      debug.diagnostico = '✅ TOKEN_SF funcionando!';
      debug.totalTasks = data.tasks?.length ?? 0;
    }
  } catch (e) {
    debug.diagnostico = '❌ Erro de rede';
    debug.erroCatch = String(e);
  }

  return res.json(debug);
}
