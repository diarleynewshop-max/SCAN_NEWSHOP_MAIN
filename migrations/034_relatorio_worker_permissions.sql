-- 034 - Permissoes minimas do worker da VPS.
-- A senha do login e definida apenas durante o deploy e nao fica neste arquivo.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'relatorio_worker') then
    create role relatorio_worker nologin;
  end if;
end $$;

grant connect on database postgres to relatorio_worker;
grant usage on schema public to relatorio_worker;
grant select on public.relatorio_whatsapp_config to relatorio_worker;
grant select on public.relatorio_whatsapp_integracao to relatorio_worker;
grant select on public.dashboard_por_secao to relatorio_worker;
grant select, insert on public.relatorio_whatsapp_envios to relatorio_worker;

drop policy if exists relatorio_worker_config on public.relatorio_whatsapp_config;
create policy relatorio_worker_config on public.relatorio_whatsapp_config
  for select to relatorio_worker using (ativo = true);

drop policy if exists relatorio_worker_integracao on public.relatorio_whatsapp_integracao;
create policy relatorio_worker_integracao on public.relatorio_whatsapp_integracao
  for select to relatorio_worker using (id = true);

drop policy if exists relatorio_worker_envios_select on public.relatorio_whatsapp_envios;
create policy relatorio_worker_envios_select on public.relatorio_whatsapp_envios
  for select to relatorio_worker using (true);

drop policy if exists relatorio_worker_envios_insert on public.relatorio_whatsapp_envios;
create policy relatorio_worker_envios_insert on public.relatorio_whatsapp_envios
  for insert to relatorio_worker with check (true);
