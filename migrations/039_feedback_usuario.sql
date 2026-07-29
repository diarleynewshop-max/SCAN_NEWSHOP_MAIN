-- 039 - Feedback interno por usuario.

alter table public.usuarios
  add column if not exists feedback_pendente boolean not null default true,
  add column if not exists feedback_respondido_em timestamptz,
  add column if not exists feedback_ultimo_aviso_em timestamptz,
  add column if not exists feedback_avisos_data date,
  add column if not exists feedback_avisos_dia integer not null default 0;

update public.usuarios
   set feedback_avisos_dia = 0
 where feedback_avisos_dia is null;

create table if not exists public.feedback_respostas (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references public.usuarios(id) on delete set null,
  empresa        text not null check (empresa in ('NEWSHOP','SOYE','FACIL','SEFULY')),
  nome           text not null,
  login          text not null,
  nota_geral     integer not null check (nota_geral between 1 and 5),
  nota_clareza   integer not null check (nota_clareza between 1 and 5),
  bom            text,
  ruim           text,
  melhorar       text,
  ferramentas    text,
  outros         text,
  rota_atual     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists feedback_respostas_created_idx
  on public.feedback_respostas (created_at desc);

create index if not exists feedback_respostas_usuario_idx
  on public.feedback_respostas (usuario_id, created_at desc);

create index if not exists feedback_respostas_empresa_idx
  on public.feedback_respostas (empresa, created_at desc);

alter table public.feedback_respostas enable row level security;
revoke all on public.feedback_respostas from anon, authenticated;

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
  permissoes jsonb,
  feedback_pendente boolean
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
         case when g.ativo then g.permissoes else '{}'::jsonb end as permissoes,
         coalesce(u.feedback_pendente, true) as feedback_pendente
    from public.usuarios u
    left join public.grupos_acesso g
      on g.id = u.grupo_acesso_id
   where u.login = lower(trim(p_login))
     and u.ativo
     and u.senha_hash = crypt(p_senha, u.senha_hash);
$$;

grant execute on function public.login_usuario(text, text) to anon, authenticated;

create or replace function public.feedback_deve_exibir(
  p_usuario_id uuid,
  p_login text
) returns table (
  deve_exibir boolean,
  motivo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_hoje date := current_date;
  v_avisos integer := 0;
begin
  if p_usuario_id is null or btrim(coalesce(p_login, '')) = '' then
    return query select false, 'usuario invalido';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('feedback:' || p_usuario_id::text));

  select *
    into v_usuario
    from public.usuarios u
   where u.id = p_usuario_id
     and u.login = lower(trim(p_login))
     and u.ativo
   for update;

  if not found then
    return query select false, 'usuario nao encontrado';
    return;
  end if;

  if coalesce(v_usuario.feedback_pendente, true) is false then
    return query select false, 'feedback respondido';
    return;
  end if;

  v_avisos := case
    when v_usuario.feedback_avisos_data = v_hoje then coalesce(v_usuario.feedback_avisos_dia, 0)
    else 0
  end;

  if v_avisos >= 2 then
    return query select false, 'limite diario';
    return;
  end if;

  if v_usuario.feedback_avisos_data = v_hoje
     and v_usuario.feedback_ultimo_aviso_em is not null
     and v_usuario.feedback_ultimo_aviso_em > now() - interval '6 hours' then
    return query select false, 'intervalo minimo';
    return;
  end if;

  update public.usuarios
     set feedback_ultimo_aviso_em = now(),
         feedback_avisos_data = v_hoje,
         feedback_avisos_dia = v_avisos + 1
   where id = v_usuario.id;

  return query select true, 'exibir';
end $$;

grant execute on function public.feedback_deve_exibir(uuid, text) to anon, authenticated;

create or replace function public.feedback_enviar_resposta(
  p_usuario_id uuid,
  p_login text,
  p_empresa text,
  p_nota_geral integer,
  p_nota_clareza integer,
  p_bom text default null,
  p_ruim text default null,
  p_melhorar text default null,
  p_ferramentas text default null,
  p_outros text default null,
  p_rota_atual text default null,
  p_user_agent text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_empresa text := upper(btrim(coalesce(p_empresa, '')));
  v_bom text := nullif(btrim(coalesce(p_bom, '')), '');
  v_ruim text := nullif(btrim(coalesce(p_ruim, '')), '');
  v_melhorar text := nullif(btrim(coalesce(p_melhorar, '')), '');
  v_ferramentas text := nullif(btrim(coalesce(p_ferramentas, '')), '');
  v_outros text := nullif(btrim(coalesce(p_outros, '')), '');
  v_id uuid;
begin
  if p_usuario_id is null or btrim(coalesce(p_login, '')) = '' then
    raise exception 'usuario invalido';
  end if;

  perform pg_advisory_xact_lock(hashtext('feedback:' || p_usuario_id::text));

  select *
    into v_usuario
    from public.usuarios u
   where u.id = p_usuario_id
     and u.login = lower(trim(p_login))
     and u.ativo
   for update;

  if not found then
    raise exception 'usuario nao encontrado';
  end if;

  if coalesce(v_usuario.feedback_pendente, true) is false then
    raise exception 'feedback ja respondido';
  end if;

  if v_empresa not in ('NEWSHOP','SOYE','FACIL','SEFULY') or not (v_empresa = any(v_usuario.empresas)) then
    raise exception 'empresa invalida';
  end if;

  if p_nota_geral not between 1 and 5 or p_nota_clareza not between 1 and 5 then
    raise exception 'notas invalidas';
  end if;

  if v_bom is null and v_ruim is null and v_melhorar is null and v_ferramentas is null and v_outros is null then
    raise exception 'preencha ao menos um comentario';
  end if;

  insert into public.feedback_respostas (
    usuario_id,
    empresa,
    nome,
    login,
    nota_geral,
    nota_clareza,
    bom,
    ruim,
    melhorar,
    ferramentas,
    outros,
    rota_atual,
    user_agent
  )
  values (
    v_usuario.id,
    v_empresa,
    v_usuario.nome,
    v_usuario.login,
    p_nota_geral,
    p_nota_clareza,
    v_bom,
    v_ruim,
    v_melhorar,
    v_ferramentas,
    v_outros,
    nullif(btrim(coalesce(p_rota_atual, '')), ''),
    nullif(btrim(coalesce(p_user_agent, '')), '')
  )
  returning id into v_id;

  update public.usuarios
     set feedback_pendente = false,
         feedback_respondido_em = now()
   where id = v_usuario.id;

  return v_id;
end $$;

grant execute on function public.feedback_enviar_resposta(uuid, text, text, integer, integer, text, text, text, text, text, text, text)
  to anon, authenticated;

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
