create or replace function public.chat_mensagens_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  select count(*)
    into v_count
  from public.mensagens
  where empresa = new.empresa
    and remetente = new.remetente
    and created_at > now() - interval '60 seconds';

  if v_count >= 8 then
    raise exception 'Limite de mensagens atingido. Aguarde um pouco antes de enviar de novo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chat_mensagens_rate_limit on public.mensagens;

create trigger trg_chat_mensagens_rate_limit
before insert on public.mensagens
for each row
execute function public.chat_mensagens_rate_limit();
