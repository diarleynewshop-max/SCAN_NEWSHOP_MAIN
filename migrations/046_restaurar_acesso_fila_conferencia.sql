-- =====================================================================
-- 046 — Restaura acesso da fila de Conferência pelo cliente do app
--
-- O app ainda usa login próprio e acessa o Supabase com a chave anon.
-- Sem os GRANTs, o PostgREST retorna 401: permission denied for table
-- pedidos, mesmo que a policy RLS exista.
-- =====================================================================

grant select, insert, update, delete on table public.pedidos
  to anon, authenticated;

grant select, insert, update, delete on table public.pedido_itens
  to anon, authenticated;

grant select, insert, update, delete on table public.recomendacoes_substituicao
  to anon, authenticated;

alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.recomendacoes_substituicao enable row level security;

drop policy if exists pedidos_anon_all on public.pedidos;
create policy pedidos_anon_all on public.pedidos
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists pedido_itens_anon_all on public.pedido_itens;
create policy pedido_itens_anon_all on public.pedido_itens
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists recomendacoes_substituicao_anon_all on public.recomendacoes_substituicao;
create policy recomendacoes_substituicao_anon_all on public.recomendacoes_substituicao
  for all to anon, authenticated
  using (true)
  with check (true);
