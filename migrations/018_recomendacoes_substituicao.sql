-- =====================================================================
-- RECOMENDACOES INTERNAS DE SUBSTITUICAO DE ITEM
-- Fluxo:
-- 1) Conferente/admin sugere item parecido para um item pendente.
-- 2) Pessoa do pedido aceita/recusa no app.
-- 3) Admin aplica a troca no pedido pendente.
-- 4) Item original entra em Compras como falta.
-- =====================================================================

create table if not exists public.recomendacoes_substituicao (
  id                        uuid primary key default gen_random_uuid(),
  empresa                   text not null check (empresa in ('NEWSHOP','SOYE','FACIL')),
  flag                      text not null default 'loja' check (flag in ('loja','cd')),
  pedido_id                 uuid not null references public.pedidos (id) on delete cascade,
  pedido_item_id            uuid not null references public.pedido_itens (id) on delete cascade,
  pedido_titulo             text,
  pedido_pessoa             text,
  codigo_original           text not null,
  sku_original              text,
  descricao_original        text,
  foto_original             text,
  codigo_sugerido           text not null,
  sku_sugerido              text,
  descricao_sugerida        text,
  secao_sugerida            text,
  foto_sugerida             text,
  erp_id_sugerido           text,
  sugerido_por              text not null,
  destinatario              text not null,
  observacao                text,
  status                    text not null default 'pendente'
                            check (status in ('pendente','aceita','recusada','aplicada','cancelada')),
  respondido_por            text,
  respondido_em             timestamptz,
  aplicado_por              text,
  aplicado_em               timestamptz,
  resultado_visto_sugerente boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists recomendacoes_substituicao_pedido_idx
  on public.recomendacoes_substituicao (pedido_id, status, created_at desc);

create index if not exists recomendacoes_substituicao_destinatario_idx
  on public.recomendacoes_substituicao (empresa, flag, destinatario, status, created_at desc);

create index if not exists recomendacoes_substituicao_sugerido_por_idx
  on public.recomendacoes_substituicao (empresa, flag, sugerido_por, status, resultado_visto_sugerente, created_at desc);

drop trigger if exists trg_recomendacoes_substituicao_updated on public.recomendacoes_substituicao;
create trigger trg_recomendacoes_substituicao_updated before update on public.recomendacoes_substituicao
  for each row execute function public.set_updated_at();

alter table public.recomendacoes_substituicao replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recomendacoes_substituicao'
  ) then
    execute 'alter publication supabase_realtime add table public.recomendacoes_substituicao';
  end if;
end $$;

alter table public.recomendacoes_substituicao enable row level security;

drop policy if exists recomendacoes_substituicao_anon_all on public.recomendacoes_substituicao;
create policy recomendacoes_substituicao_anon_all on public.recomendacoes_substituicao
  for all to anon, authenticated using (true) with check (true);
