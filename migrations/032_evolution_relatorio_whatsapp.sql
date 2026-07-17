-- 032 - Credenciais privadas da Evolution API e idempotencia do envio diario.

create table if not exists public.relatorio_whatsapp_integracao (
  id boolean primary key default true check (id),
  provider text not null default 'evolution' check (provider = 'evolution'),
  base_url text not null,
  api_key text not null,
  instance_name text not null,
  sender_number text not null,
  updated_at timestamptz not null default now()
);

alter table public.relatorio_whatsapp_integracao enable row level security;
revoke all on public.relatorio_whatsapp_integracao from anon, authenticated;

create unique index if not exists relatorio_whatsapp_um_envio_por_dia
  on public.relatorio_whatsapp_envios (config_id, data_relatorio)
  where status = 'enviado';
