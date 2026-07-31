-- =====================================================================
-- Ajusta a fila PDV para o fluxo correto:
--   SCAN web grava JSON no Supabase;
--   conector local no PC transforma JSON em RPX*.ECF.
--
-- Mantem compatibilidade com linhas antigas que ja tenham `conteudo`.
-- =====================================================================

alter table public.pdv_prevenda_fila
  add column if not exists payload_json jsonb;

alter table public.pdv_prevenda_fila
  alter column conteudo drop not null;

do $$
begin
  alter table public.pdv_prevenda_fila
    add constraint pdv_prevenda_fila_tem_payload
    check (payload_json is not null or conteudo is not null);
exception
  when duplicate_object then null;
end $$;

comment on column public.pdv_prevenda_fila.payload_json is
  'JSON operacional do pedido/pre-venda. O conector local transforma em RPX*.ECF.';

comment on column public.pdv_prevenda_fila.conteudo is
  'Compatibilidade legado: RPX*.ECF ja gerado antes de o fluxo migrar para payload_json.';

