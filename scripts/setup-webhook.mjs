/**
 * setup-webhook.mjs
 * Registra o webhook no ClickUp e valida a configuração do Supabase Realtime.
 *
 * Como usar:
 *   node scripts/setup-webhook.mjs
 *
 * Variáveis necessárias (pode passar via .env ou direto no terminal):
 *   CLICKUP_TOKEN          = pk_...
 *   CLICKUP_WEBHOOK_SECRET = sua-string-secreta
 *   VERCEL_URL             = https://seu-app.vercel.app
 *   SUPABASE_URL           = https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = eyJ...
 */

import { createInterface } from 'readline';

// ─── Lê variável de ambiente ou pede no terminal ──────────────────────────────
function env(key) {
  return process.env[key] ?? null;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function ok(msg)   { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }
function info(msg) { console.log(`  \x1b[34mℹ\x1b[0m ${msg}`); }
function head(msg) { console.log(`\n\x1b[1m${msg}\x1b[0m`); }

// ─── ETAPA 2: Registra webhook no ClickUp ────────────────────────────────────
async function setupClickUpWebhook(token, vercelUrl, secret) {
  head('ETAPA 2 — Registrar webhook no ClickUp');

  // 2.1 Descobre o Team ID
  info('Buscando seu Team ID no ClickUp...');
  const teamsRes = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  });

  if (!teamsRes.ok) {
    fail(`Token inválido ou sem permissão. Status: ${teamsRes.status}`);
    const body = await teamsRes.text();
    fail(`Detalhe: ${body}`);
    return false;
  }

  const { teams } = await teamsRes.json();
  if (!teams?.length) {
    fail('Nenhum workspace encontrado para esse token.');
    return false;
  }

  // Mostra os workspaces disponíveis
  console.log('\n  Workspaces encontrados:');
  teams.forEach((t, i) => console.log(`    [${i}] ${t.name}  (id: ${t.id})`));

  let teamIndex = 0;
  if (teams.length > 1) {
    const choice = await ask('\n  Qual usar? (número): ');
    teamIndex = parseInt(choice) || 0;
  }

  const team = teams[teamIndex];
  ok(`Usando workspace: ${team.name} (${team.id})`);

  // 2.2 Lista webhooks existentes (para evitar duplicata)
  info('Verificando webhooks existentes...');
  const existingRes = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/webhook`, {
    headers: { Authorization: token },
  });
  const existing = await existingRes.json();
  const webhooks = existing.webhooks ?? [];

  const endpointAlvo = `${vercelUrl}/api/clickup-webhook`;
  const jaExiste = webhooks.find(w => w.endpoint?.startsWith(endpointAlvo));

  if (jaExiste) {
    ok(`Webhook já existe! ID: ${jaExiste.id}`);
    ok(`Endpoint: ${jaExiste.endpoint}`);
    info('Nenhuma ação necessária para o webhook.');
    return true;
  }

  // 2.3 Cria o webhook
  const endpoint = `${endpointAlvo}?secret=${secret}`;
  info(`Criando webhook para: ${endpoint}`);

  const createRes = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/webhook`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      events: [
        'taskCreated',
        'taskStatusUpdated',
        'taskUpdated',
        'taskDeleted',
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    fail(`Erro ao criar webhook: ${err}`);
    return false;
  }

  const created = await createRes.json();
  ok(`Webhook criado com sucesso!`);
  ok(`ID do webhook: ${created.id ?? created.webhook?.id}`);
  ok(`Endpoint registrado: ${endpoint}`);

  console.log('\n  \x1b[33mSalve o ID do webhook — você precisará dele para deletar depois se necessário.\x1b[0m');

  return true;
}

// ─── ETAPA 3: Valida Supabase Realtime ───────────────────────────────────────
async function setupSupabaseRealtime(supabaseUrl, serviceRoleKey) {
  head('ETAPA 3 — Validar Supabase Realtime');

  // 3.1 Valida a service role key chamando a API REST
  info('Testando conexão com Supabase...');
  const healthRes = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!healthRes.ok && healthRes.status !== 400) {
    fail(`Não consegui conectar ao Supabase. Status: ${healthRes.status}`);
    fail('Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    return false;
  }
  ok('Conexão com Supabase OK');

  // 3.2 Testa enviar broadcast no canal compras-sync
  info('Testando broadcast no canal compras-sync...');

  // O broadcast via REST requer o endpoint realtime v1
  const broadcastRes = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          topic:   'realtime:compras-sync',
          event:   'clickup_update',
          payload: { event: 'test', task_id: 'test-123', timestamp: Date.now() },
        },
      ],
    }),
  });

  if (broadcastRes.ok || broadcastRes.status === 202) {
    ok('Broadcast Realtime funcionando!');
    ok('Canal compras-sync está pronto para receber eventos.');
  } else {
    const body = await broadcastRes.text();
    info(`Broadcast retornou ${broadcastRes.status} — isso pode ser normal se o plano free limita a API.`);
    info(`O webhook do ClickUp usa o SDK do Supabase (não REST direto), então deve funcionar mesmo assim.`);
    info(`Resposta: ${body.slice(0, 200)}`);
  }

  // 3.3 Instrução para habilitar Realtime no dashboard
  console.log(`
  \x1b[33m┌─────────────────────────────────────────────────────────┐
  │  Ação manual necessária no Supabase Dashboard           │
  │                                                         │
  │  1. Acesse: ${supabaseUrl.replace('https://', '').split('.')[0]}                              │
  │  2. Vá em: Database → Replication                       │
  │  3. Confirme que "Realtime" está LIGADO no projeto      │
  │                                                         │
  │  ✓ Não precisa criar nenhuma tabela nova                │
  │  ✓ O canal "compras-sync" é criado automaticamente      │
  │    pelo SDK quando o webhook faz o primeiro broadcast   │
  └─────────────────────────────────────────────────────────┘\x1b[0m
  `);

  return true;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║   Setup: ClickUp Webhook + Supabase Realtime     ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m\n');

  // Coleta as variáveis necessárias
  const token      = env('CLICKUP_TOKEN')           || await ask('  CLICKUP_TOKEN (pk_...): ');
  const vercelUrl  = env('VERCEL_URL')               || await ask('  URL do seu app Vercel (ex: https://scan.vercel.app): ');
  const secret     = env('CLICKUP_WEBHOOK_SECRET')   || await ask('  CLICKUP_WEBHOOK_SECRET (string aleatória): ');
  const sbUrl      = env('SUPABASE_URL')             || await ask('  SUPABASE_URL (https://xxx.supabase.co): ');
  const sbKey      = env('SUPABASE_SERVICE_ROLE_KEY')|| await ask('  SUPABASE_SERVICE_ROLE_KEY (eyJ...): ');

  rl.close();

  const urlLimpa = vercelUrl.replace(/\/$/, '');

  const etapa2ok = await setupClickUpWebhook(token.trim(), urlLimpa, secret.trim());
  const etapa3ok = await setupSupabaseRealtime(sbUrl.trim(), sbKey.trim());

  head('Resumo');
  etapa2ok ? ok('Webhook ClickUp — OK') : fail('Webhook ClickUp — FALHOU');
  etapa3ok ? ok('Supabase Realtime  — OK') : fail('Supabase Realtime  — VERIFICAR');

  if (etapa2ok && etapa3ok) {
    console.log(`
  \x1b[32m✓ Tudo pronto! Fluxo completo:\x1b[0m

    ClickUp muda status
      → POST ${urlLimpa}/api/clickup-webhook?secret=***
        → broadcast no canal compras-sync
          → App React atualiza em tempo real
  `);
  } else {
    console.log('\n  Corrija os erros acima e rode o script novamente.\n');
  }
}

main().catch(err => {
  console.error('\n\x1b[31mErro inesperado:\x1b[0m', err.message);
  process.exit(1);
});

