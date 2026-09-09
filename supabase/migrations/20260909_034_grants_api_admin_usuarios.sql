-- =========================================================
-- 034 - PERMISSÕES DE LEITURA PARA API ADMINISTRATIVA
-- O Box Driver - Protótipo / Sandbox
--
-- Corrige:
-- permission denied for table franqueados
--
-- A API /api/admin/usuarios usa o client supabaseAdmin,
-- autenticado com a role service_role.
--
-- service_role ignora RLS, mas ainda precisa ter privilégio
-- SQL explícito sobre as tabelas consultadas.
-- =========================================================


-- Leitura necessária para preencher os combos da tela
grant select on table public.franqueados to service_role;
grant select on table public.unidades to service_role;

-- A API também consulta os perfis internos
grant select, insert, update, delete
on table public.perfil_cliente
to service_role;


-- =========================================================
-- VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   grantee,
--   table_name,
--   privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in (
--     'franqueados',
--     'unidades',
--     'perfil_cliente'
--   )
--   and grantee = 'service_role'
-- order by table_name, privilege_type;
--
-- =========================================================
