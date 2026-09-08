-- =====================================================================
-- 047 — TRANSFERENCIA ENTRE LOJAS (NEWSHOP / SOYE / FACIL)
--
-- Ate aqui um pedido sempre nasceu e morreu dentro da MESMA empresa:
-- a loja pedia, o CD da propria empresa separava. `pedidos.empresa`
-- sempre significou, na pratica, "de quem e a fila de conferencia".
--
-- Transferencia entre lojas nao muda esse significado — ela so responde
-- uma pergunta que antes nao existia: "essa separacao vai para quem?".
--
--   empresa          = quem SEPARA e MANDA  (dono da fila de conferencia)
--   empresa_destino  = quem RECEBE          (null no fluxo interno de sempre)
--   tipo             = 'reposicao' (fluxo de sempre) | 'transferencia'
--
-- Manter `empresa` como a ORIGEM e o que faz o resto do app continuar
-- funcionando de graca: a fila de conferencia, a senha da conferencia e
-- TODAS as consultas de ERP (endereco de picking, preco, foto) ja sao
-- por `empresa` — e quem confere e o estoque consultado sao os da origem.
--
-- SEFULY fica de fora por decisao de negocio (ver src/lib/lojaFeatures.ts).
-- Idempotente.
-- =====================================================================

alter table public.pedidos
  add column if not exists empresa_destino text,
  add column if not exists tipo text not null default 'reposicao';

do $$
begin
  alter table public.pedidos drop constraint if exists pedidos_empresa_destino_check;
  alter table public.pedidos add constraint pedidos_empresa_destino_check
    check (empresa_destino is null or empresa_destino in ('NEWSHOP','SOYE','FACIL')) not valid;

  alter table public.pedidos drop constraint if exists pedidos_tipo_check;
  alter table public.pedidos add constraint pedidos_tipo_check
    check (tipo in ('reposicao','transferencia')) not valid;

  -- Transferencia exige destino, e destino nunca e a propria origem.
  -- Reposicao (fluxo de sempre) exige destino nulo.
  alter table public.pedidos drop constraint if exists pedidos_transferencia_coerente_check;
  alter table public.pedidos add constraint pedidos_transferencia_coerente_check
    check (
      (tipo = 'reposicao'     and empresa_destino is null)
      or
      (tipo = 'transferencia' and empresa_destino is not null and empresa_destino <> empresa)
    ) not valid;
end $$;

-- O destinatario precisa achar rapido o que ele pediu para a outra loja
-- (Meus Pedidos / tela de Transferencias).
create index if not exists pedidos_empresa_destino_idx
  on public.pedidos (empresa_destino, status)
  where empresa_destino is not null;

create index if not exists pedidos_tipo_idx
  on public.pedidos (tipo, empresa, status)
  where tipo = 'transferencia';
