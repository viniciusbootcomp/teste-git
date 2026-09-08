-- =========================================================
-- O BOX DRIVER
-- Permissões do backend para reservas de estoque
--
-- O backend Mercado Pago precisa consultar a reserva
-- antes de preparar/criar o pagamento.
-- =========================================================


-- =========================================================
-- 1. RESERVAS
-- =========================================================

grant select
on public.reservas_estoque
to service_role;


-- =========================================================
-- 2. ITENS DA RESERVA
--
-- O backend também poderá precisar consultar os itens
-- durante o fluxo de pagamento.
-- =========================================================

grant select
on public.itens_reserva_estoque
to service_role;


-- =========================================================
-- 3. CONFIGURAÇÕES DO SISTEMA
--
-- Necessário para parâmetros como tempo do PIX.
-- =========================================================

grant select
on public.configuracoes_sistema
to service_role;