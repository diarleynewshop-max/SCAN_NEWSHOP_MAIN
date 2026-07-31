-- =====================================================================
-- Fila de pre-venda para o PDV (SYSpdv / Casa Magalhaes)
--
-- Fluxo:
--   App (conferencia concluida) --insert JSON--> public.pdv_prevenda_fila
--   Conector local (Windows, retaguarda) --polling--> gera e escreve RPX*.ECF
--   Conector marca a linha como 'entregue'
--
-- Por que fila e nao POST direto no servidor: a retaguarda fica atras de NAT
-- (sem IP publico/porta aberta). O conector PUXA, entao nao precisa expor nada.
--
-- O app web grava somente o JSON operacional. A transformacao para o arquivo
-- posicional acontece no PC/servidor local, dentro do conector. A coluna
-- `conteudo` fica como compatibilidade para filas antigas que ja tenham o
-- RPX*.ECF pronto.
-- =====================================================================

-- Numero da pre-venda: sequencia global. O layout aceita 9 digitos (campo 2) e
-- 10 digitos (campo 18); o app faz o padding.
create sequence if not exists public.pdv_prevenda_numero_seq as bigint start with 1 minvalue 1;

create table if not exists public.pdv_prevenda_fila (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('NEWSHOP','SOYE','FACIL','SEFULY')),

  -- Rastreabilidade com a conferencia que originou a pre-venda.
  pedido_id uuid references public.pedidos (id) on delete set null,
  conference_id text,

  numero_prevenda bigint not null unique,
  nome_arquivo text not null,
  -- JSON completo necessario para o conector local gerar o RPX*.ECF.
  payload_json jsonb,
  -- Compatibilidade legado: conteudo posicional COMPLETO do RPX*.ECF.
  conteudo text,

  total_itens integer not null check (total_itens > 0),
  valor_total numeric(12,2) not null check (valor_total >= 0),

  status text not null default 'pendente'
    check (status in ('pendente','entregue','erro','cancelado')),
  tentativas integer not null default 0,
  erro text,

  conferente text,
  cliente_nome text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  entregue_em timestamptz,
  -- Hostname do conector que gravou o arquivo (auditoria: qual servidor pegou).
  entregue_por text,

  constraint pdv_prevenda_fila_tem_payload
    check (payload_json is not null or conteudo is not null)
);

-- O conector busca sempre "pendente mais antigo primeiro" por loja.
create index if not exists pdv_prevenda_fila_pendentes_idx
  on public.pdv_prevenda_fila (empresa, status, created_at)
  where status = 'pendente';

create index if not exists pdv_prevenda_fila_pedido_idx
  on public.pdv_prevenda_fila (pedido_id);

drop trigger if exists trg_pdv_prevenda_fila_updated_at on public.pdv_prevenda_fila;
create trigger trg_pdv_prevenda_fila_updated_at
  before update on public.pdv_prevenda_fila
  for each row execute function public.set_updated_at();

-- ── Reserva do numero da pre-venda ──────────────────────────────────────────
-- O app precisa do numero ANTES de montar o arquivo (o numero aparece em todos
-- os registros). Gaps na sequencia sao aceitaveis: numero queimado por erro de
-- geracao nao volta, e isso nao quebra nada no PDV.
create or replace function public.pdv_prevenda_reservar_numero()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.pdv_prevenda_numero_seq');
$$;

-- ── Baixa da fila pelo conector ─────────────────────────────────────────────
-- Marca como entregue de forma idempotente: se a linha ja saiu de 'pendente'
-- retorna false e o conector NAO grava de novo (evita pre-venda duplicada no
-- caixa se dois conectores estiverem rodando).
create or replace function public.pdv_prevenda_marcar_entregue(
  p_id uuid,
  p_host text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  update public.pdv_prevenda_fila
     set status = 'entregue',
         entregue_em = now(),
         entregue_por = nullif(btrim(p_host), ''),
         erro = null
   where id = p_id
     and status = 'pendente';

  v_ok := found;
  return v_ok;
end $$;

create or replace function public.pdv_prevenda_marcar_erro(
  p_id uuid,
  p_erro text,
  p_host text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pdv_prevenda_fila
     set tentativas = tentativas + 1,
         erro = left(coalesce(p_erro, 'erro desconhecido'), 2000),
         entregue_por = nullif(btrim(p_host), ''),
         -- Depois de 5 tentativas para de tentar: alguem precisa olhar.
         status = case when tentativas + 1 >= 5 then 'erro' else 'pendente' end
   where id = p_id
     and status in ('pendente','erro');
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo padrao do resto do projeto (login e local, app usa chave anon):
-- anon/authenticated podem inserir e ler. A BAIXA da fila (update de status) fica
-- restrita ao service_role via as funcoes acima — o conector usa service_role.
alter table public.pdv_prevenda_fila enable row level security;

drop policy if exists pdv_prevenda_fila_anon_insert on public.pdv_prevenda_fila;
create policy pdv_prevenda_fila_anon_insert on public.pdv_prevenda_fila
  for insert to anon, authenticated with check (true);

drop policy if exists pdv_prevenda_fila_anon_select on public.pdv_prevenda_fila;
create policy pdv_prevenda_fila_anon_select on public.pdv_prevenda_fila
  for select to anon, authenticated using (true);

drop policy if exists pdv_prevenda_fila_service_all on public.pdv_prevenda_fila;
create policy pdv_prevenda_fila_service_all on public.pdv_prevenda_fila
  for all to service_role using (true) with check (true);

grant select, insert on public.pdv_prevenda_fila to anon, authenticated;
grant all on public.pdv_prevenda_fila to service_role;
grant usage on sequence public.pdv_prevenda_numero_seq to anon, authenticated, service_role;

grant execute on function public.pdv_prevenda_reservar_numero() to anon, authenticated, service_role;
revoke all on function public.pdv_prevenda_marcar_entregue(uuid, text) from public;
revoke all on function public.pdv_prevenda_marcar_erro(uuid, text, text) from public;
grant execute on function public.pdv_prevenda_marcar_entregue(uuid, text) to service_role;
grant execute on function public.pdv_prevenda_marcar_erro(uuid, text, text) to service_role;
