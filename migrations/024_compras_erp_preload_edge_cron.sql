-- Agenda o enriquecimento ERP de Compras dentro do Supabase/VPS.
--
-- Requer pg_cron + pg_net habilitados no banco da VPS. A URL padrao usa o
-- servico interno do stack self-hosted (`kong`); se o compose usar outro nome,
-- configure antes:
--   alter database postgres set app.settings.functions_url = 'http://kong:8000/functions/v1';
--
-- Opcional, se a Edge Function tiver COMPRAS_ERP_PRELOAD_SECRET:
--   alter database postgres set app.settings.compras_erp_preload_secret = '...';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('compras-erp-preload');
exception
  when others then
    null;
end $$;

select cron.schedule(
  'compras-erp-preload',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.settings.functions_url', true), ''),
      'http://kong:8000/functions/v1'
    ) || '/compras-erp-preload',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(current_setting('app.settings.compras_erp_preload_secret', true), '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
