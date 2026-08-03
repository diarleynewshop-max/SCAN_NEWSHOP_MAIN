-- 044 - Usuario nao escolhe mais flag CD/Loja.
-- A flag operacional de pedidos continua existindo, mas usuario sempre nasce
-- e loga como loja.

update public.usuarios
   set flag_default = 'loja'
 where coalesce(flag_default, '') <> 'loja';

alter table public.usuarios drop constraint if exists usuarios_flag_default_chk;
alter table public.usuarios add constraint usuarios_flag_default_chk
  check (flag_default = 'loja') not valid;
alter table public.usuarios validate constraint usuarios_flag_default_chk;

create or replace function public.criar_conta_operador(
  p_login text,
  p_nome text,
  p_senha text,
  p_empresas text[],
  p_flag_default text default 'loja'
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_login text;
  v_empresas text[];
begin
  v_login := lower(btrim(coalesce(p_login, '')));

  if v_login = '' or btrim(coalesce(p_nome, '')) = '' then
    raise exception 'login e nome obrigatorios';
  end if;

  if btrim(coalesce(p_senha, '')) = '' then
    raise exception 'senha obrigatoria';
  end if;

  v_empresas := public.admin_normalizar_empresas(p_empresas);
  if array_length(v_empresas, 1) is null then
    raise exception 'selecione ao menos uma empresa';
  end if;

  if exists (select 1 from public.usuarios u where u.login = v_login) then
    raise exception 'login ja existe' using errcode = 'unique_violation';
  end if;

  insert into public.usuarios(
    login, nome, senha_hash, role, empresas, flag_default, secoes_compras, secao_padrao, ativo
  ) values (
    v_login,
    btrim(p_nome),
    crypt(p_senha, gen_salt('bf')),
    'operador',
    v_empresas,
    'loja',
    '{}'::text[],
    null,
    true
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.criar_conta_operador(text, text, text, text[], text) to anon, authenticated;

create or replace function public.admin_criar_usuario(
  p_actor_login text,
  p_actor_senha text,
  p_login text,
  p_nome text,
  p_senha text,
  p_role text,
  p_empresas text[],
  p_flag_default text default 'loja',
  p_secoes text[] default '{}',
  p_secao_padrao text default null,
  p_grupo_acesso_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_empresas text[];
  v_secao_padrao text;
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  v_empresas := public.admin_normalizar_empresas(p_empresas);
  if array_length(v_empresas, 1) is null then
    raise exception 'empresas invalidas';
  end if;

  if p_role not in ('operador','compras','admin','super') then
    raise exception 'role invalida';
  end if;

  if btrim(coalesce(p_login, '')) = '' or btrim(coalesce(p_nome, '')) = '' then
    raise exception 'login e nome obrigatorios';
  end if;

  if btrim(coalesce(p_senha, '')) = '' then
    raise exception 'senha obrigatoria';
  end if;

  if p_grupo_acesso_id is not null and not exists (
    select 1 from public.grupos_acesso g where g.id = p_grupo_acesso_id and g.ativo
  ) then
    raise exception 'grupo de acesso invalido';
  end if;

  v_secao_padrao := nullif(btrim(coalesce(p_secao_padrao, '')), '');

  insert into public.usuarios(
    login,
    nome,
    senha_hash,
    role,
    empresas,
    flag_default,
    secoes_compras,
    secao_padrao,
    grupo_acesso_id,
    ativo
  )
  values (
    lower(trim(p_login)),
    btrim(p_nome),
    crypt(p_senha, gen_salt('bf')),
    p_role,
    v_empresas,
    'loja',
    coalesce(p_secoes, '{}'::text[]),
    v_secao_padrao,
    p_grupo_acesso_id,
    true
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.admin_criar_usuario(text, text, text, text, text, text, text[], text, text[], text, uuid) to anon, authenticated;

create or replace function public.admin_atualizar_usuario(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid,
  p_nome text,
  p_role text,
  p_empresas text[],
  p_flag_default text,
  p_secoes text[] default '{}',
  p_secao_padrao text default null,
  p_ativo boolean default true,
  p_grupo_acesso_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_empresas text[];
  v_secao_padrao text;
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  v_empresas := public.admin_normalizar_empresas(p_empresas);
  if array_length(v_empresas, 1) is null then
    raise exception 'empresas invalidas';
  end if;

  if p_role not in ('operador','compras','admin','super') then
    raise exception 'role invalida';
  end if;

  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'nome obrigatorio';
  end if;

  if p_grupo_acesso_id is not null and not exists (
    select 1 from public.grupos_acesso g where g.id = p_grupo_acesso_id and g.ativo
  ) then
    raise exception 'grupo de acesso invalido';
  end if;

  v_secao_padrao := nullif(btrim(coalesce(p_secao_padrao, '')), '');

  update public.usuarios
     set nome = btrim(p_nome),
         role = p_role,
         empresas = v_empresas,
         flag_default = 'loja',
         secoes_compras = coalesce(p_secoes, '{}'::text[]),
         secao_padrao = v_secao_padrao,
         grupo_acesso_id = p_grupo_acesso_id,
         ativo = coalesce(p_ativo, true)
   where id = p_id;
end $$;

grant execute on function public.admin_atualizar_usuario(text, text, uuid, text, text, text[], text, text[], text, boolean, uuid) to anon, authenticated;
