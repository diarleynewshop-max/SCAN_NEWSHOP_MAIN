-- 031 - Configuracao e historico do relatorio diario por WhatsApp.

create table if not exists public.relatorio_whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  empresas text[] not null default '{NEWSHOP}',
  flag text not null default 'loja' check (flag in ('loja','cd','todos')),
  secoes text[] not null default '{}',
  numero_whatsapp text not null,
  horario time not null default '07:00',
  ativo boolean not null default true,
  updated_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relatorio_whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references public.relatorio_whatsapp_config(id) on delete set null,
  data_relatorio date not null,
  numero_whatsapp text not null,
  status text not null check (status in ('enviado','erro','sem_dados')),
  mensagem_id text,
  erro text,
  created_at timestamptz not null default now()
);

alter table public.relatorio_whatsapp_config enable row level security;
alter table public.relatorio_whatsapp_envios enable row level security;
revoke all on public.relatorio_whatsapp_config from anon, authenticated;
revoke all on public.relatorio_whatsapp_envios from anon, authenticated;

create or replace function public.super_relatorio_whatsapp_obter(
  p_actor_login text,
  p_actor_senha text
) returns setof public.relatorio_whatsapp_config
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.usuarios u
     where u.login = lower(trim(p_actor_login))
       and u.ativo and u.role = 'super'
       and u.senha_hash = crypt(p_actor_senha, u.senha_hash)
  ) then
    raise exception 'apenas usuario super pode configurar';
  end if;
  return query select * from public.relatorio_whatsapp_config order by created_at;
end $$;

create or replace function public.super_relatorio_whatsapp_salvar(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid,
  p_empresas text[],
  p_flag text,
  p_secoes text[],
  p_numero text,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_id uuid;
  v_numero text;
begin
  select u.id into v_actor_id
    from public.usuarios u
   where u.login = lower(trim(p_actor_login))
     and u.ativo and u.role = 'super'
     and u.senha_hash = crypt(p_actor_senha, u.senha_hash);
  if v_actor_id is null then raise exception 'apenas usuario super pode configurar'; end if;

  v_numero := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  if length(v_numero) < 12 or length(v_numero) > 15 then
    raise exception 'numero de WhatsApp invalido; use DDI e DDD';
  end if;
  if coalesce(array_length(p_empresas, 1), 0) = 0 then raise exception 'selecione uma empresa'; end if;
  if p_flag not in ('loja','cd','todos') then raise exception 'flag invalida'; end if;

  if p_id is null then
    insert into public.relatorio_whatsapp_config
      (empresas, flag, secoes, numero_whatsapp, horario, ativo, updated_by)
    values
      (p_empresas, p_flag, coalesce(p_secoes, '{}'), v_numero, '07:00', coalesce(p_ativo, true), v_actor_id)
    returning id into v_id;
  else
    update public.relatorio_whatsapp_config
       set empresas = p_empresas, flag = p_flag, secoes = coalesce(p_secoes, '{}'),
           numero_whatsapp = v_numero, horario = '07:00',
           ativo = coalesce(p_ativo, true), updated_by = v_actor_id, updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'configuracao nao encontrada'; end if;
  end if;
  return v_id;
end $$;

grant execute on function public.super_relatorio_whatsapp_obter(text, text) to anon, authenticated;
grant execute on function public.super_relatorio_whatsapp_salvar(text, text, uuid, text[], text, text[], text, boolean) to anon, authenticated;

