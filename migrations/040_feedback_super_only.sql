-- 040 - Restringe consulta de feedback somente para usuario super.

create or replace function public.admin_listar_feedback(
  p_actor_login text,
  p_actor_senha text,
  p_empresa text default null,
  p_limite integer default 500
) returns table (
  id uuid,
  usuario_id uuid,
  empresa text,
  nome text,
  login text,
  nota_geral integer,
  nota_clareza integer,
  bom text,
  ruim text,
  melhorar text,
  ferramentas text,
  outros text,
  rota_atual text,
  user_agent text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresa text := nullif(upper(btrim(coalesce(p_empresa, ''))), '');
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), 1000);
begin
  if not exists (
    select 1
      from public.usuarios u
     where u.login = lower(trim(p_actor_login))
       and u.ativo
       and u.role = 'super'
       and u.senha_hash = crypt(p_actor_senha, u.senha_hash)
  ) then
    raise exception 'apenas usuario super pode ver feedback';
  end if;

  if v_empresa is not null and v_empresa not in ('NEWSHOP','SOYE','FACIL','SEFULY') then
    raise exception 'empresa invalida';
  end if;

  return query
  select f.id,
         f.usuario_id,
         f.empresa,
         f.nome,
         f.login,
         f.nota_geral,
         f.nota_clareza,
         f.bom,
         f.ruim,
         f.melhorar,
         f.ferramentas,
         f.outros,
         f.rota_atual,
         f.user_agent,
         f.created_at
    from public.feedback_respostas f
   where v_empresa is null or f.empresa = v_empresa
   order by f.created_at desc
   limit v_limite;
end $$;

grant execute on function public.admin_listar_feedback(text, text, text, integer) to anon, authenticated;
