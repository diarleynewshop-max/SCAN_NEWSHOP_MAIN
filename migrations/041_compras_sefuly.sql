-- =====================================================================
-- Compras da SEFULY: base PROPRIA
--
-- Regra do dominio de Compras hoje:
--   NEWSHOP -> 'NEWSHOP'
--   SOYE/FACIL -> 'SF' (mesma empresa: mesmo preco, mesmo setor de compras)
--   SEFULY  -> 'SEFULY'  <-- NOVO, base isolada (setor de compras proprio)
--
-- Antes desta migration a SEFULY caia silenciosamente no bucket 'NEWSHOP'
-- (o frontend mapeava tudo que nao fosse SOYE/FACIL para NEWSHOP), ou seja o
-- comprador da SEFULY lia e gravava na base da NEWSHOP.
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.compras') is not null then
    alter table public.compras drop constraint if exists compras_empresa_check;
    alter table public.compras add constraint compras_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY'));
  end if;

  if to_regclass('public.compras_produto_fornecedores') is not null then
    alter table public.compras_produto_fornecedores
      drop constraint if exists compras_produto_fornecedores_empresa_check;
    -- O check inline de 022 nasce com nome gerado pelo Postgres; remove por nome
    -- provavel e recria com nome estavel.
    alter table public.compras_produto_fornecedores
      drop constraint if exists compras_produto_fornecedores_empresa_check1;
    alter table public.compras_produto_fornecedores
      add constraint compras_produto_fornecedores_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY')) not valid;
  end if;

  if to_regclass('public.compras_marcas') is not null then
    alter table public.compras_marcas drop constraint if exists compras_marcas_empresa_check;
    alter table public.compras_marcas drop constraint if exists compras_marcas_empresa_check1;
    alter table public.compras_marcas add constraint compras_marcas_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY')) not valid;
  end if;
end $$;

-- Os checks inline criados em 022 podem ter nome auto-gerado (ex.:
-- compras_produto_fornecedores_empresa_check) mas se o nome real for outro o
-- ALTER acima nao o remove. Varre e derruba qualquer check de `empresa` que
-- ainda nao aceite SEFULY.
do $$
declare
  r record;
begin
  for r in
    select c.conname, t.relname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and c.contype = 'c'
       and t.relname in ('compras', 'compras_produto_fornecedores', 'compras_marcas')
       and pg_get_constraintdef(c.oid) like '%empresa%'
       and pg_get_constraintdef(c.oid) not like '%SEFULY%'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
    raise notice 'Removido check antigo %.%', r.relname, r.conname;
  end loop;
end $$;

-- Garante que os checks novos existam depois da varredura acima.
do $$
begin
  if to_regclass('public.compras') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'compras_empresa_check'
     ) then
    alter table public.compras add constraint compras_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY'));
  end if;

  if to_regclass('public.compras_produto_fornecedores') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'compras_produto_fornecedores_empresa_check'
     ) then
    alter table public.compras_produto_fornecedores
      add constraint compras_produto_fornecedores_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY')) not valid;
  end if;

  if to_regclass('public.compras_marcas') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'compras_marcas_empresa_check'
     ) then
    alter table public.compras_marcas add constraint compras_marcas_empresa_check
      check (empresa in ('NEWSHOP','SF','SEFULY')) not valid;
  end if;
end $$;
