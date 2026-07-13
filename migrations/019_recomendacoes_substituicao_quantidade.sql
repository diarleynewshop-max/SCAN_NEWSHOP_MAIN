alter table public.recomendacoes_substituicao
  add column if not exists quantidade_sugerida integer;

update public.recomendacoes_substituicao
   set quantidade_sugerida = 1
 where quantidade_sugerida is null;

alter table public.recomendacoes_substituicao
  alter column quantidade_sugerida set default 1;
