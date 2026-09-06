-- =========================================================
-- O BOX DRIVER
-- Proteção da conversão de reserva em pedido
--
-- Objetivo:
-- impedir que o cliente autenticado consiga aprovar
-- a própria compra chamando a RPC diretamente.
--
-- A conversão passa a ser responsabilidade exclusiva
-- do backend usando service_role.
-- =========================================================

revoke execute
on function public.converter_reserva_em_pedido(uuid)
from authenticated;

revoke execute
on function public.converter_reserva_em_pedido(uuid)
from anon;

revoke execute
on function public.converter_reserva_em_pedido(uuid)
from public;

grant execute
on function public.converter_reserva_em_pedido(uuid)
to service_role;