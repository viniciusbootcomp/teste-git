-- =========================================================
-- O BOX DRIVER
-- Permissões server-side para operação dos terminais
--
-- A service_role é utilizada exclusivamente pelo backend.
-- Não estamos liberando estas tabelas para anon.
-- =========================================================


-- =========================================================
-- TERMINAIS
-- =========================================================

grant select
on table public.terminais_checkin
to service_role;


-- =========================================================
-- UNIDADES
--
-- Necessário porque a ativação do terminal consulta
-- também a unidade associada.
-- =========================================================

grant select
on table public.unidades
to service_role;