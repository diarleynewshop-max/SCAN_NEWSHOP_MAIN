-- Reforco idempotente para o robo de enriquecimento ERP de Compras.
-- Mantem compatibilidade com bancos que ainda nao aplicaram a 008 e permite
-- lock via anon quando a service role do ambiente estiver ausente/incorreta.

alter table public.compras
  add column if not exists erp_sync_at timestamptz,
  add column if not exists erp_sync_error text;

create table if not exists public.compras_erp_sync_locks (
  lock_name text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.compras_erp_sync_locks enable row level security;

create or replace function public.compras_erp_sync_try_lock(
  p_lock_name text,
  p_ttl_minutes integer default 5
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.compras_erp_sync_locks (lock_name, locked_until, updated_at)
  values (p_lock_name, now() + make_interval(mins => p_ttl_minutes), now())
  on conflict (lock_name) do update
    set locked_until = excluded.locked_until,
        updated_at = now()
    where public.compras_erp_sync_locks.locked_until < now()
  returning true into acquired;

  return coalesce(acquired, false);
end $$;

revoke all on function public.compras_erp_sync_try_lock(text, integer)
  from public;

grant execute on function public.compras_erp_sync_try_lock(text, integer)
  to service_role, anon;
