-- 035 - Adiciona criterio de envio ao relatorio WhatsApp.

alter table public.relatorio_whatsapp_config
  add column if not exists criterio text not null default 'diario';

alter table public.relatorio_whatsapp_config
  drop constraint if exists relatorio_whatsapp_config_criterio_check;

alter table public.relatorio_whatsapp_config
  add constraint relatorio_whatsapp_config_criterio_check
  check (criterio in ('diario', 'semanal', 'mensal'));

create or replace function public.super_relatorio_whatsapp_salvar(
  p_actor_login text,
  p_actor_senha text,
  p_id uuid,
  p_empresas text[],
  p_flag text,
  p_secoes text[],
  p_numero text,
  p_criterio text,
  p_ativo boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_actor_id uuid;
  v_id uuid;
  v_numero text;
  v_criterio text;
begin
  select u.id into v_actor_id
    from public.usuarios u
   where u.login = lower(trim(p_actor_login))
     and u.ativo and u.role = 'super'
     and u.senha_hash = crypt(p_actor_senha, u.senha_hash);
  if v_actor_id is null then raise exception 'apenas usuario super pode configurar'; end if;

  v_numero := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_criterio := lower(trim(coalesce(p_criterio, 'diario')));

  if length(v_numero) < 12 or length(v_numero) > 15 then
    raise exception 'numero de WhatsApp invalido; use DDI e DDD';
  end if;
  if coalesce(array_length(p_empresas, 1), 0) = 0 then raise exception 'selecione uma empresa'; end if;
  if p_flag not in ('loja','cd','todos') then raise exception 'flag invalida'; end if;
  if v_criterio not in ('diario', 'semanal', 'mensal') then
    raise exception 'criterio invalido';
  end if;

  if p_id is null then
    insert into public.relatorio_whatsapp_config
      (empresas, flag, secoes, numero_whatsapp, criterio, horario, ativo, updated_by)
    values
      (p_empresas, p_flag, coalesce(p_secoes, '{}'), v_numero, v_criterio, '07:00', coalesce(p_ativo, true), v_actor_id)
    returning id into v_id;
  else
    update public.relatorio_whatsapp_config
       set empresas = p_empresas,
           flag = p_flag,
           secoes = coalesce(p_secoes, '{}'),
           numero_whatsapp = v_numero,
           criterio = v_criterio,
           horario = '07:00',
           ativo = coalesce(p_ativo, true),
           updated_by = v_actor_id,
           updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'configuracao nao encontrada'; end if;
  end if;
  return v_id;
end $$;

grant execute on function public.super_relatorio_whatsapp_salvar(text, text, uuid, text[], text, text[], text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
