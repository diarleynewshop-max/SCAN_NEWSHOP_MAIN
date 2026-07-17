-- 030 - Exclusao permanente de conta, restrita a usuario super.

create or replace function public.super_excluir_usuario(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_target_role text;
begin
  perform pg_advisory_xact_lock(hashtext('super_excluir_usuario'));

  select u.id
    into v_actor_id
    from public.usuarios u
   where u.login = lower(trim(p_actor_login))
     and u.ativo
     and u.role = 'super'
     and u.senha_hash = crypt(p_actor_senha, u.senha_hash);

  if v_actor_id is null then
    raise exception 'apenas usuario super pode excluir contas';
  end if;

  if p_id = v_actor_id then
    raise exception 'sua propria conta nao pode ser excluida';
  end if;

  select u.role
    into v_target_role
    from public.usuarios u
   where u.id = p_id
   for update;

  if v_target_role is null then
    raise exception 'usuario nao encontrado';
  end if;

  if v_target_role = 'super'
     and (select count(*) from public.usuarios where role = 'super' and ativo) <= 1 then
    raise exception 'nao e permitido excluir o ultimo usuario super';
  end if;

  delete from public.usuarios where id = p_id;
  return found;
end $$;

revoke all on function public.super_excluir_usuario(text, text, uuid) from public;
grant execute on function public.super_excluir_usuario(text, text, uuid) to anon, authenticated;
