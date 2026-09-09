-- =========================================================
-- 030 - RLS ADMINISTRATIVO DE PRODUTOS
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Manter leitura pública apenas de produtos ativos
-- 2. Permitir ao admin visualizar ativos e inativos
-- 3. Permitir ao admin cadastrar produtos
-- 4. Permitir ao admin editar produtos
-- 5. Permitir ao admin excluir produtos, caso necessário
--
-- Observação:
-- O estoque oficial continua sendo controlado por
-- public.estoque_unidade. Esta migration não altera estoque.
-- =========================================================


-- =========================================================
-- 1. GARANTE RLS ATIVA
-- =========================================================

alter table public.produtos
enable row level security;


-- =========================================================
-- 2. LEITURA PÚBLICA DOS PRODUTOS ATIVOS
-- =========================================================

drop policy if exists
  publico_le_produtos_ativos
on public.produtos;

create policy
  publico_le_produtos_ativos
on public.produtos
for select
to anon, authenticated
using (
  ativo = true
);


-- =========================================================
-- 3. ADMIN PODE VISUALIZAR TODOS OS PRODUTOS
--    INCLUSIVE INATIVOS
-- =========================================================

drop policy if exists
  "Admins podem visualizar todos os produtos"
on public.produtos;

create policy
  "Admins podem visualizar todos os produtos"
on public.produtos
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 4. ADMIN PODE CADASTRAR PRODUTOS
-- =========================================================

drop policy if exists
  "Admins podem cadastrar produtos"
on public.produtos;

create policy
  "Admins podem cadastrar produtos"
on public.produtos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 5. ADMIN PODE EDITAR PRODUTOS
-- =========================================================

drop policy if exists
  "Admins podem editar produtos"
on public.produtos;

create policy
  "Admins podem editar produtos"
on public.produtos
for update
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 6. ADMIN PODE EXCLUIR PRODUTOS
-- =========================================================

drop policy if exists
  "Admins podem excluir produtos"
on public.produtos;

create policy
  "Admins podem excluir produtos"
on public.produtos
for delete
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 7. GRANTS NECESSÁRIOS
-- =========================================================

grant select, insert, update, delete
on public.produtos
to authenticated;

grant select
on public.produtos
to anon;


-- =========================================================
-- 8. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- Depois de executar, você pode conferir as policies com:
--
-- select
--   policyname,
--   cmd,
--   roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'produtos'
-- order by policyname;
--
-- =========================================================
