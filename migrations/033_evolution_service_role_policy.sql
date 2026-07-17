-- 033 - A funcao Vercel usa service_role para ler a integracao privada.

drop policy if exists relatorio_whatsapp_integracao_service_role
  on public.relatorio_whatsapp_integracao;

create policy relatorio_whatsapp_integracao_service_role
  on public.relatorio_whatsapp_integracao
  for select
  to service_role
  using (true);

grant select on public.relatorio_whatsapp_integracao to service_role;

notify pgrst, 'reload schema';
