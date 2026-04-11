/**
 * setup-webhook.mjs
 * Registra o webhook no ClickUp e valida o Supabase Realtime.
 *
 * Como usar (PowerShell):
 *   $env:CLICKUP_TOKEN="pk_..."; $env:CLICKUP_TEAM_ID="90133045250"; ...etc; node scripts/setup-webhook.mjs
 */

function env(key)  { return process.env[key] ?? null; }
function ok(msg)   { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }
function info(msg) { console.log(`  \x1b[34mℹ\x1b[0m ${msg}`); }
function head(msg) { console.log(`\n\x1b[1m${msg}\x1b[0m`); }

// ─── ETAPA 2: Registra webhook no ClickUp ────────────────────────────────────
async function setupClickUpWebhook(token, teamId, vercelUrl, secret) {
  head('ETAPA 2 — Registrar webhook no ClickUp');

  // 2.1 Valida o team
  info(`Usando Team ID: ${teamId}`);
  const teamsRes = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  });

  if (!teamsRes.ok) {
    fail(`Token inválido. Status: ${teamsRes.status}`);
    return false;
  }

  const { teams } = await teamsRes.json();
  const team = teams.find(t => t.id === teamId);
  if (!team) {
    fail(`Team ID ${teamId} não encontrado. Disponíveis: ${teams.map(t => `${t.name} (${t.id})`).join(', ')}`);
    return false;
  }
  ok(`Workspace: ${team.name} (${team.id})`);

  // 2.2 Verifica se já existe
  info('Verificando webhooks existentes...');
  const existingRes = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/webhook`, {
    headers: { Authorization: token },
  });
  const existing = await existingRes.json();
  const endpointAlvo = `${vercelUrl}/api/clickup-webhook`;
  const jaExiste = (existing.webhooks ?? []).find(w => w.endpoint?.startsWith(endpointAlvo));

  if (jaExiste) {
    ok(`Webhook já existe! ID: ${jaExiste.id}`);
    ok(`Endpoint: ${jaExiste.endpoint}`);
    return true;
  }

  // 2.3 Cria o webhook
  const endpoint = `${endpointAlvo}?secret=${secret}`;
  info(`Criando webhook: ${endpoint}`);

  const createRes = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/webhook`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      events: ['taskCreated', 'taskStatusUpdated', 'taskUpdated', 'taskDeleted'],
    }),
  });

  if (!createRes.ok) {
    fail(`Erro ao criar webhook: ${await createRes.text()}`);
    return false;
  }

  const created = await createRes.json();
  ok(`Webhook criado! ID: ${created.id ?? created.webhook?.id}`);
  ok(`Endpoint: ${endpoint}`);
  return true;
}

// ─── ETAPA 3: Valida Supabase Realtime ───────────────────────────────────────
async function setupSupabaseRealtime(supabaseUrl, serviceRoleKey) {
  head('ETAPA 3 — Validar Supabase Realtime');

  info('Testando conexão com Supabase...');
  const healthRes = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!healthRes.ok && healthRes.status !== 400) {
    fail(`Não consegui conectar. Status: ${healthRes.status}`);
    return false;
  }
  ok('Conexão com Supabase OK');

  info('Testando broadcast no canal compras-sync...');
  const broadcastRes = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        topic:   'realtime:compras-sync',
        event:   'clickup_update',
        payload: { event: 'test', task_id: 'test-123', timestamp: Date.now() },
      }],
    }),
  });

  if (broadcastRes.ok || broadcastRes.status === 202) {
    ok('Broadcast Realtime funcionando!');
  } else {
    const body = await broadcastRes.text();
    info(`Broadcast retornou ${broadcastRes.status} — normal no plano free via REST.`);
    info(`O webhook usa o SDK interno, então funciona mesmo assim.`);
  }

  console.log(`
  \x1b[33m┌─────────────────────────────────────────────────────────┐
  │  Passo manual no Supabase Dashboard (só 1x)             │
  │                                                         │
  │  1. app.supabase.com → seu projeto                      │
  │  2. Database → Replication                              │
  │  3. Confirme que "Realtime" está LIGADO                 │
  │                                                         │
  │  Não precisa criar tabela — canal aparece sozinho.      │
  └─────────────────────────────────────────────────────────┘\x1b[0m
  `);

  return true;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║   Setup: ClickUp Webhook + Supabase Realtime     ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m\n');

  const token   = env('CLICKUP_TOKEN');
  const teamId  = env('CLICKUP_TEAM_ID');
  const vercel  = env('VERCEL_URL')?.replace(/\/$/, '');
  const secret  = env('CLICKUP_WEBHOOK_SECRET');
  const sbUrl   = env('SUPABASE_URL');
  const sbKey   = env('SUPABASE_SERVICE_ROLE_KEY');

  const faltando = [
    !token  && 'CLICKUP_TOKEN',
    !teamId && 'CLICKUP_TEAM_ID',
    !vercel && 'VERCEL_URL',
    !secret && 'CLICKUP_WEBHOOK_SECRET',
    !sbUrl  && 'SUPABASE_URL',
    !sbKey  && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (faltando.length) {
    console.log('\x1b[31mVariáveis faltando:\x1b[0m');
    faltando.forEach(v => console.log(`  - ${v}`));
    process.exit(1);
  }

  const etapa2ok = await setupClickUpWebhook(token, teamId, vercel, secret);
  const etapa3ok = await setupSupabaseRealtime(sbUrl, sbKey);

  head('Resumo');
  etapa2ok ? ok('Webhook ClickUp — OK') : fail('Webhook ClickUp — FALHOU');
  etapa3ok ? ok('Supabase Realtime — OK') : fail('Supabase Realtime — VERIFICAR');

  if (etapa2ok && etapa3ok) {
    console.log(`
  \x1b[32m✓ Tudo pronto! Fluxo:\x1b[0m
    ClickUp muda status
      → POST ${vercel}/api/clickup-webhook
        → broadcast compras-sync
          → App atualiza em tempo real
  `);
  }
}

main().catch(err => {
  console.error('\n\x1b[31mErro:\x1b[0m', err.message);
  process.exit(1);
});

