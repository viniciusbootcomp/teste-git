-- =========================================================
-- O BOX DRIVER
-- Expiração formal de reservas de estoque
-- =========================================================

create or replace function public.expirar_reservas_estoque()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantidade integer;
begin

  update public.reservas_estoque
  set status = 'expirada'
  where status = 'ativa'
    and expira_em <= now();

  get diagnostics v_quantidade = row_count;

  return v_quantidade;
end;
$$;


revoke all
on function public.expirar_reservas_estoque()
from public;


grant execute
on function public.expirar_reservas_estoque()
to service_role;