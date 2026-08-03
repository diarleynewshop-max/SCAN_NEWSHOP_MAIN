-- 045 - Supabase Advisor: Security Definer View
--
-- As views do Dashboard sao lidas pelo frontend com anon key. No Postgres,
-- views usam privilegios do dono por padrao; o Advisor marca isso porque pode
-- contornar RLS das tabelas base. security_invoker faz a view respeitar o role
-- que consultou a view.
--
-- Mantem SELECT explicito para os roles usados pelo app.

alter view if exists public.dashboard_diario set (security_invoker = true);
alter view if exists public.dashboard_semanal set (security_invoker = true);
alter view if exists public.dashboard_pedidos_status set (security_invoker = true);
alter view if exists public.dashboard_por_conferente set (security_invoker = true);
alter view if exists public.dashboard_por_secao set (security_invoker = true);
alter view if exists public.dashboard_item_frequencia set (security_invoker = true);

grant select on public.dashboard_diario to anon, authenticated, service_role;
grant select on public.dashboard_semanal to anon, authenticated, service_role;
grant select on public.dashboard_pedidos_status to anon, authenticated, service_role;
grant select on public.dashboard_por_conferente to anon, authenticated, service_role;
grant select on public.dashboard_por_secao to anon, authenticated, service_role;
grant select on public.dashboard_item_frequencia to anon, authenticated, service_role;
