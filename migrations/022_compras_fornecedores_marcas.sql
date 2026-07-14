create table if not exists public.compras_produto_fornecedores (
  id                   uuid primary key default gen_random_uuid(),
  empresa              text not null check (empresa in ('NEWSHOP','SF')),
  produto_key          text not null,
  codigo               text not null,
  sku                  text,
  produto_erp_id       text,
  fornecedor_id        text not null,
  fornecedor_nome      text,
  fornecedor_fantasia  text,
  fornecedor_documento text,
  principal            boolean not null default false,
  placeholder          boolean not null default false,
  synced_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint compras_produto_fornecedores_unq unique (empresa, produto_key, fornecedor_id)
);

create index if not exists compras_produto_fornecedores_empresa_produto_idx
  on public.compras_produto_fornecedores (empresa, produto_key);

create index if not exists compras_produto_fornecedores_empresa_fornecedor_idx
  on public.compras_produto_fornecedores (empresa, fornecedor_id);

create table if not exists public.compras_marcas (
  id         uuid primary key default gen_random_uuid(),
  empresa    text not null check (empresa in ('NEWSHOP','SF')),
  nome       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compras_marcas_empresa_slug_unq unique (empresa, slug)
);

create index if not exists compras_marcas_empresa_nome_idx
  on public.compras_marcas (empresa, nome);

create table if not exists public.compras_marca_fornecedores (
  id                   uuid primary key default gen_random_uuid(),
  marca_id             uuid not null references public.compras_marcas(id) on delete cascade,
  fornecedor_id        text not null,
  fornecedor_nome      text,
  fornecedor_documento text,
  alias                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint compras_marca_fornecedores_unq unique (marca_id, fornecedor_id)
);

create index if not exists compras_marca_fornecedores_fornecedor_idx
  on public.compras_marca_fornecedores (fornecedor_id);

drop trigger if exists trg_compras_produto_fornecedores_updated on public.compras_produto_fornecedores;
create trigger trg_compras_produto_fornecedores_updated
before update on public.compras_produto_fornecedores
for each row execute function public.set_updated_at();

drop trigger if exists trg_compras_marcas_updated on public.compras_marcas;
create trigger trg_compras_marcas_updated
before update on public.compras_marcas
for each row execute function public.set_updated_at();

drop trigger if exists trg_compras_marca_fornecedores_updated on public.compras_marca_fornecedores;
create trigger trg_compras_marca_fornecedores_updated
before update on public.compras_marca_fornecedores
for each row execute function public.set_updated_at();

alter table public.compras_produto_fornecedores enable row level security;
alter table public.compras_marcas enable row level security;
alter table public.compras_marca_fornecedores enable row level security;

drop policy if exists compras_produto_fornecedores_anon_all on public.compras_produto_fornecedores;
create policy compras_produto_fornecedores_anon_all on public.compras_produto_fornecedores
  for all to anon, authenticated using (true) with check (true);

drop policy if exists compras_marcas_anon_all on public.compras_marcas;
create policy compras_marcas_anon_all on public.compras_marcas
  for all to anon, authenticated using (true) with check (true);

drop policy if exists compras_marca_fornecedores_anon_all on public.compras_marca_fornecedores;
create policy compras_marca_fornecedores_anon_all on public.compras_marca_fornecedores
  for all to anon, authenticated using (true) with check (true);
