-- 026 - Foto de perfil self-service.

alter table public.usuarios
  add column if not exists foto_url text;

drop function if exists public.login_usuario(text, text);

create function public.login_usuario(p_login text, p_senha text)
returns table (
  id uuid,
  login text,
  nome text,
  role text,
  empresas text[],
  flag_default text,
  secoes_compras text[],
  secao_padrao text,
  foto_url text
)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id,
         u.login,
         u.nome,
         u.role,
         u.empresas,
         u.flag_default,
         u.secoes_compras,
         u.secao_padrao,
         u.foto_url
    from public.usuarios u
   where u.login = lower(trim(p_login))
     and u.ativo
     and u.senha_hash = crypt(p_senha, u.senha_hash);
$$;

grant execute on function public.login_usuario(text, text) to anon, authenticated;

create or replace function public.atualizar_minha_foto(
  p_usuario_id uuid,
  p_login text,
  p_foto_url text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuarios
     set foto_url = nullif(btrim(coalesce(p_foto_url, '')), '')
   where id = p_usuario_id
     and login = lower(trim(p_login))
     and ativo;

  return found;
end $$;

grant execute on function public.atualizar_minha_foto(uuid, text, text) to anon, authenticated;

drop function if exists public.chat_listar_usuarios(text);

create function public.chat_listar_usuarios(p_empresa text)
returns table (
  login text,
  nome text,
  role text,
  foto_url text
)
language sql
security definer
set search_path = public
as $$
  select u.login,
         u.nome,
         u.role,
         u.foto_url
    from public.usuarios u
   where u.ativo
     and upper(trim(p_empresa)) = any(u.empresas)
   order by u.nome asc;
$$;

grant execute on function public.chat_listar_usuarios(text) to anon, authenticated, service_role;
