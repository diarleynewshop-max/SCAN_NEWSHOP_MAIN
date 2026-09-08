-- =====================================================================
-- 048 — Liberar "Transferencia entre lojas" para todo mundo
--
-- A permissao `transferencia` passou a valer para o papel `operador` tambem
-- (ver ROLE_PERMISSION_DEFAULTS em src/lib/accessControl.ts).
--
-- Mas quem esta preso a um GRUPO DE ACESSO nao usa o padrao do papel: o app
-- monta as permissoes desse usuario a partir de ALL_FALSE + o mapa salvo no
-- grupo (`resolverPermissoes` com usarPermissoesCustomizadas). Como os grupos
-- ja existentes foram salvos antes dessa permissao existir, a chave nao esta
-- la e o usuario ficaria sem o card mesmo com a mudanca no codigo.
--
-- Esta migration acrescenta a chave nos grupos que ainda nao a tem.
--
-- Idempotente: o `where not (permissoes ? 'transferencia')` garante que, se um
-- admin DESMARCAR a permissao de um grupo depois, rodar de novo nao vai
-- reativar sem querer.
-- =====================================================================

update public.grupos_acesso
   set permissoes = coalesce(permissoes, '{}'::jsonb) || '{"transferencia": true}'::jsonb
 where not (coalesce(permissoes, '{}'::jsonb) ? 'transferencia');

-- Conferencia: lista os grupos e como ficou a permissao.
--   select nome, ativo, permissoes -> 'transferencia' as transferencia
--     from public.grupos_acesso order by nome;
