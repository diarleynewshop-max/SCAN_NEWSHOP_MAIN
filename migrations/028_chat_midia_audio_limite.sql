alter table public.mensagens
  add column if not exists midia_url text,
  add column if not exists midia_mime text,
  add column if not exists midia_nome text,
  add column if not exists midia_tamanho integer;

alter table public.mensagens
  drop constraint if exists mensagens_tipo_check;

alter table public.mensagens
  add constraint mensagens_tipo_check
  check (tipo in ('texto','foto','audio','item','recomendacao'));

alter table public.mensagens
  drop constraint if exists mensagens_midia_tamanho_check;

alter table public.mensagens
  add constraint mensagens_midia_tamanho_check
  check (midia_tamanho is null or midia_tamanho <= 5242880);

alter table public.mensagens
  drop constraint if exists mensagens_midia_mime_check;

alter table public.mensagens
  add constraint mensagens_midia_mime_check
  check (
    midia_mime is null or lower(midia_mime) in (
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/webm'
    )
  );
