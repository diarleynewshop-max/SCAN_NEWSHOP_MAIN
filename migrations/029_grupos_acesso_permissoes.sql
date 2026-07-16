-- 029 - Grupos de acesso com permissoes por tela/acao.

create table if not exists public.grupos_acesso (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  permissoes jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists grupos_acesso_nome_unq
  on public.grupos_acesso (lower(btrim(nome)));

drop trigger if exists trg_grupos_acesso_updated on public.grupos_acesso;
create trigger trg_grupos_acesso_updated before update on public.grupos_acesso
for each row execute function public.set_updated_at();

alter table public.grupos_acesso enable row level security;
revoke all on public.grupos_acesso from anon, authenticated;

alter table public.usuarios
  add column if not exists grupo_acesso_id uuid references public.grupos_acesso(id);

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
  foto_url text,
  grupo_acesso_id uuid,
  grupo_acesso_nome text,
  permissoes jsonb
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
         u.foto_url,
         u.grupo_acesso_id,
         g.nome as grupo_acesso_nome,
         case when g.ativo then g.permissoes else '{}'::jsonb end as permissoes
    from public.usuarios u
    left join public.grupos_acesso g
      on g.id = u.grupo_acesso_id
   where u.login = lower(trim(p_login))
     and u.ativo
     and u.senha_hash = crypt(p_senha, u.senha_hash);
$$;

grant execute on function public.login_usuario(text, text) to anon, authenticated;

drop function if exists public.admin_listar_usuarios(text, text);

create function public.admin_listar_usuarios(
  p_actor_login text,
  p_actor_senha text
) returns table (
  id uuid,
  login text,
  nome text,
  role text,
  empresas text[],
  flag_default text,
  secoes_compras text[],
  secao_padrao text,
  foto_url text,
  grupo_acesso_id uuid,
  grupo_acesso_nome text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  return query
  select u.id,
         u.login,
         u.nome,
         u.role,
         u.empresas,
         u.flag_default,
         u.secoes_compras,
         u.secao_padrao,
         u.foto_url,
         u.grupo_acesso_id,
         g.nome as grupo_acesso_nome,
         u.ativo,
         u.created_at,
         u.updated_at
    from public.usuarios u
    left join public.grupos_acesso g
      on g.id = u.grupo_acesso_id
   order by u.ativo desc, u.nome asc;
end $$;

grant execute on function public.admin_listar_usuarios(text, text) to anon, authenticated;

drop function if exists public.admin_criar_usuario(text, text, text, text, text, text, text[], text, text[], text);
drop function if exists public.admin_criar_usuario(text, text, text, text, text, text, text[], text, text[], text, uuid);

create function public.admin_criar_usuario(
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

  if lower(coalesce(p_flag_default, 'loja')) not in ('loja','cd') then
    raise exception 'flag invalida';
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
    lower(p_flag_default),
    coalesce(p_secoes, '{}'::text[]),
    v_secao_padrao,
    p_grupo_acesso_id,
    true
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.admin_criar_usuario(text, text, text, text, text, text, text[], text, text[], text, uuid) to anon, authenticated;

drop function if exists public.admin_atualizar_usuario(text, text, uuid, text, text, text[], text, text[], text, boolean);
drop function if exists public.admin_atualizar_usuario(text, text, uuid, text, text, text[], text, text[], text, boolean, uuid);

create function public.admin_atualizar_usuario(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid,
  p_nome text,
  p_role text,
  p_empresas text[],
  p_flag_default text,
  p_secoes text[],
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

  if lower(coalesce(p_flag_default, 'loja')) not in ('loja','cd') then
    raise exception 'flag invalida';
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
         flag_default = lower(coalesce(p_flag_default, 'loja')),
         secoes_compras = coalesce(p_secoes, '{}'::text[]),
         secao_padrao = v_secao_padrao,
         grupo_acesso_id = p_grupo_acesso_id,
         ativo = coalesce(p_ativo, true)
   where id = p_id;
end $$;

grant execute on function public.admin_atualizar_usuario(text, text, uuid, text, text, text[], text, text[], text, boolean, uuid) to anon, authenticated;

create or replace function public.admin_listar_grupos_acesso(
  p_actor_login text,
  p_actor_senha text
) returns table (
  id uuid,
  nome text,
  descricao text,
  permissoes jsonb,
  ativo boolean,
  usuarios_vinculados bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  return query
  select g.id,
         g.nome,
         g.descricao,
         g.permissoes,
         g.ativo,
         count(u.id) as usuarios_vinculados,
         g.created_at,
         g.updated_at
    from public.grupos_acesso g
    left join public.usuarios u
      on u.grupo_acesso_id = g.id
   group by g.id
   order by g.ativo desc, g.nome asc;
end $$;

grant execute on function public.admin_listar_grupos_acesso(text, text) to anon, authenticated;

create or replace function public.admin_criar_grupo_acesso(
  p_actor_login text,
  p_actor_senha text,
  p_nome text,
  p_descricao text default null,
  p_permissoes jsonb default '{}'::jsonb,
  p_ativo boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'nome obrigatorio';
  end if;

  insert into public.grupos_acesso(nome, descricao, permissoes, ativo)
  values (
    btrim(p_nome),
    nullif(btrim(coalesce(p_descricao, '')), ''),
    coalesce(p_permissoes, '{}'::jsonb),
    coalesce(p_ativo, true)
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.admin_criar_grupo_acesso(text, text, text, text, jsonb, boolean) to anon, authenticated;

create or replace function public.admin_atualizar_grupo_acesso(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid,
  p_nome text,
  p_descricao text default null,
  p_permissoes jsonb default '{}'::jsonb,
  p_ativo boolean default true
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.usuario_admin_autorizado(p_actor_login, p_actor_senha) then
    raise exception 'nao autorizado';
  end if;

  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'nome obrigatorio';
  end if;

  update public.grupos_acesso
     set nome = btrim(p_nome),
         descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
         permissoes = coalesce(p_permissoes, '{}'::jsonb),
         ativo = coalesce(p_ativo, true)
   where id = p_id;
end $$;

grant execute on function public.admin_atualizar_grupo_acesso(text, text, uuid, text, text, jsonb, boolean) to anon, authenticated;
