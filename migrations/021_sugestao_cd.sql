create table if not exists public.sugestao_cd_itens (
  id                uuid primary key default gen_random_uuid(),
  empresa           text not null check (empresa in ('NEWSHOP','SOYE','FACIL')),
  produto_key       text not null,
  codigo            text not null,
  sku               text,
  descricao         text,
  secao             text,
  foto_url          text,
  qtd_erp_loja      integer not null default 0,
  qtd_erp_cd        integer not null default 0,
  qtd_erp_deposito  integer not null default 0,
  qtd_contada       integer not null default 0,
  qtd_desejada      integer,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sugestao_cd_empresa_produto_key unique (empresa, produto_key),
  constraint sugestao_cd_qtd_contada_chk check (qtd_contada >= 0),
  constraint sugestao_cd_qtd_desejada_chk check (qtd_desejada is null or qtd_desejada > 0)
);

create index if not exists sugestao_cd_empresa_secao_idx
  on public.sugestao_cd_itens (empresa, secao);

create index if not exists sugestao_cd_empresa_updated_idx
  on public.sugestao_cd_itens (empresa, updated_at desc);

drop trigger if exists trg_sugestao_cd_updated on public.sugestao_cd_itens;
create trigger trg_sugestao_cd_updated
before update on public.sugestao_cd_itens
for each row execute function public.set_updated_at();

alter table public.sugestao_cd_itens replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sugestao_cd_itens'
  ) then
    execute 'alter publication supabase_realtime add table public.sugestao_cd_itens';
  end if;
end $$;

alter table public.sugestao_cd_itens enable row level security;

drop policy if exists sugestao_cd_itens_anon_all on public.sugestao_cd_itens;
create policy sugestao_cd_itens_anon_all on public.sugestao_cd_itens
  for all to anon, authenticated using (true) with check (true);
