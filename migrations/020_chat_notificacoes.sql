-- =====================================================================
-- CHAT 1:1 + CENTRAL DE NOTIFICACOES
--  - mensagens: chat entre usuarios (por nome), texto (<=500), foto, item
--    (mini-scanner) e recomendacao de troca.
--  - notificacoes: eventos individuais por destinatario (troca, resultado,
--    pedido concluido, nova mensagem).
--  - chat_listar_usuarios: diretorio de usuarios da empresa (qualquer usuario
--    lista os colegas para escolher com quem falar).
-- Idempotente.
-- =====================================================================

-- 1) MENSAGENS ---------------------------------------------------------
create table if not exists public.mensagens (
  id              uuid primary key default gen_random_uuid(),
  empresa         text not null,
  remetente       text not null,   -- nome de quem enviou
  destinatario    text not null,   -- nome de quem recebe
  conteudo        text not null default '' check (char_length(conteudo) <= 500),
  foto_url        text,
  item_codigo     text,
  item_sku        text,
  item_descricao  text,
  item_foto       text,
  tipo            text not null default 'texto'
                  check (tipo in ('texto','foto','item','recomendacao')),
  recomendacao_id uuid references public.recomendacoes_substituicao (id) on delete set null,
  lida            boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx
  on public.mensagens (empresa, remetente, destinatario, created_at);
create index if not exists mensagens_destinatario_idx
  on public.mensagens (empresa, destinatario, lida, created_at desc);

-- 2) NOTIFICACOES ------------------------------------------------------
create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null,
  destinatario  text not null,   -- nome de quem recebe
  tipo          text not null
                check (tipo in ('recomendacao','resultado_troca','pedido_concluido','mensagem')),
  titulo        text not null,
  corpo         text,
  ref_tipo      text,            -- 'recomendacao' | 'pedido' | 'chat'
  ref_id        text,            -- id relacionado (uuid) ou nome do remetente (chat)
  lida          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists notificacoes_destinatario_idx
  on public.notificacoes (empresa, destinatario, lida, created_at desc);

-- 3) Realtime ----------------------------------------------------------
alter table public.mensagens    replica identity full;
alter table public.notificacoes replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='mensagens') then
    execute 'alter publication supabase_realtime add table public.mensagens';
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notificacoes') then
    execute 'alter publication supabase_realtime add table public.notificacoes';
  end if;
end $$;

-- 4) RLS (permissivo, igual as demais tabelas do app) ------------------
alter table public.mensagens    enable row level security;
alter table public.notificacoes enable row level security;

drop policy if exists mensagens_anon_all on public.mensagens;
create policy mensagens_anon_all on public.mensagens
  for all to anon, authenticated using (true) with check (true);

drop policy if exists notificacoes_anon_all on public.notificacoes;
create policy notificacoes_anon_all on public.notificacoes
  for all to anon, authenticated using (true) with check (true);

-- 5) Diretorio de usuarios para o chat ---------------------------------
-- Qualquer usuario logado lista os colegas ativos da empresa para escolher
-- com quem conversar (a tabela usuarios tem RLS restrito; a RPC e security definer).
create or replace function public.chat_listar_usuarios(p_empresa text)
returns table (login text, nome text, role text)
language sql
security definer
set search_path = public
as $$
  select u.login, u.nome, u.role
  from public.usuarios u
  where u.ativo = true
    and (p_empresa is null or p_empresa = any (u.empresas))
  order by u.nome;
$$;

grant execute on function public.chat_listar_usuarios(text) to anon, authenticated, service_role;
