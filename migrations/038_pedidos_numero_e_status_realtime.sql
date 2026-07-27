-- =====================================================================
-- Numeracao sequencial por pessoa + salvamento realtime por item
-- =====================================================================

alter table public.pedidos
  add column if not exists pedido_numero integer,
  add column if not exists pedido_chave_sequencia text;

alter table public.pedido_itens
  add column if not exists conferido_em timestamptz;

create table if not exists public.pedido_sequencias (
  empresa text not null,
  flag text not null,
  pessoa_chave text not null,
  ultimo_numero integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (empresa, flag, pessoa_chave)
);

create or replace function public.pedido_pessoa_chave(
  p_pessoa text,
  p_listeiro text,
  p_titulo text
) returns text
language sql
immutable
as $$
  select coalesce(
    nullif(upper(regexp_replace(btrim(coalesce(p_pessoa, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(btrim(coalesce(p_listeiro, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(split_part(btrim(coalesce(p_titulo, '')), '-', 1), '\s+', ' ', 'g')), ''),
    'SEM NOME'
  );
$$;

create or replace function public.proximo_numero_pedido(
  p_empresa text,
  p_flag text,
  p_pessoa_chave text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  insert into public.pedido_sequencias (empresa, flag, pessoa_chave, ultimo_numero)
  values (p_empresa, p_flag, p_pessoa_chave, 1)
  on conflict (empresa, flag, pessoa_chave)
  do update set
    ultimo_numero = public.pedido_sequencias.ultimo_numero + 1,
    updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end $$;

create or replace function public.pedidos_atribuir_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
begin
  if new.pedido_numero is not null then
    new.pedido_chave_sequencia := coalesce(
      nullif(new.pedido_chave_sequencia, ''),
      public.pedido_pessoa_chave(new.pessoa, new.listeiro, new.titulo)
    );
    return new;
  end if;

  v_chave := public.pedido_pessoa_chave(new.pessoa, new.listeiro, new.titulo);
  new.pedido_chave_sequencia := v_chave;
  new.pedido_numero := public.proximo_numero_pedido(new.empresa, new.flag, v_chave);
  return new;
end $$;

drop trigger if exists trg_pedidos_atribuir_numero on public.pedidos;
create trigger trg_pedidos_atribuir_numero
  before insert on public.pedidos
  for each row execute function public.pedidos_atribuir_numero();

create index if not exists pedidos_numero_pessoa_idx
  on public.pedidos (empresa, flag, pedido_chave_sequencia, pedido_numero);

grant select, insert, update on public.pedido_sequencias to anon, authenticated, service_role;
grant execute on function public.pedido_pessoa_chave(text, text, text) to anon, authenticated, service_role;
grant execute on function public.proximo_numero_pedido(text, text, text) to anon, authenticated, service_role;

-- Backfill simples: pedidos antigos ganham numero por pessoa seguindo created_at.
with ordenados as (
  select
    id,
    public.pedido_pessoa_chave(pessoa, listeiro, titulo) as pessoa_chave,
    row_number() over (
      partition by empresa, flag, public.pedido_pessoa_chave(pessoa, listeiro, titulo)
      order by created_at nulls first, id
    ) as numero
  from public.pedidos
  where pedido_numero is null
)
update public.pedidos p
   set pedido_chave_sequencia = ordenados.pessoa_chave,
       pedido_numero = ordenados.numero
  from ordenados
 where p.id = ordenados.id;

insert into public.pedido_sequencias (empresa, flag, pessoa_chave, ultimo_numero)
select empresa, flag, pedido_chave_sequencia, max(pedido_numero)
  from public.pedidos
 where pedido_chave_sequencia is not null
   and pedido_numero is not null
 group by empresa, flag, pedido_chave_sequencia
on conflict (empresa, flag, pessoa_chave)
do update set
  ultimo_numero = greatest(public.pedido_sequencias.ultimo_numero, excluded.ultimo_numero),
  updated_at = now();
