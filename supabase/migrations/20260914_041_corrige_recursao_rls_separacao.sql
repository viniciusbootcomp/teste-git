-- =========================================================
-- 041 - CORREÇÃO DE RECURSÃO NAS POLICIES DO PERFIL SEPARAÇÃO
-- O Box Driver - Homologação / Fase 1
--
-- Problema corrigido:
-- A policy de pedidos consultava retiradas_pedido e a policy de
-- retiradas_pedido consultava pedidos, causando:
-- "infinite recursion detected in policy for relation 'pedidos'"
--
-- Solução:
-- mover a regra de visibilidade para funções SECURITY DEFINER.
-- Assim as policies não se chamam indiretamente entre si.
-- =========================================================


-- =========================================================
-- 1. REMOVE AS POLICIES DA MIGRATION 040
-- =========================================================

drop policy if exists
  "Separacao pode consultar pedidos operacionais"
on public.pedidos;

drop policy if exists
  "Separacao pode consultar retiradas operacionais"
on public.retiradas_pedido;

drop policy if exists
  "Separacao pode consultar itens das retiradas"
on public.itens_retirada;

drop policy if exists
  "Separacao pode consultar itens dos pedidos"
on public.itens_pedido;


-- =========================================================
-- 2. FUNÇÃO AUXILIAR - PEDIDO VISÍVEL PARA SEPARAÇÃO
-- =========================================================

create or replace function public.separacao_pode_ver_pedido(
  p_pedido_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfil_cliente pc
    join public.retiradas_pedido r
      on r.pedido_id = p_pedido_id
    join public.pedidos p
      on p.id = p_pedido_id
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and pc.tipo_usuario = 'separacao'
      and p.status_pagamento = 'aprovado'
      and r.status in (
        'recebido',
        'em_separacao',
        'pronto_retirada'
      )
      and (
        pc.unidade_id is null
        or r.unidade_id = pc.unidade_id
      )
  );
$$;

revoke all
on function public.separacao_pode_ver_pedido(uuid)
from public;

grant execute
on function public.separacao_pode_ver_pedido(uuid)
to authenticated;


-- =========================================================
-- 3. FUNÇÃO AUXILIAR - RETIRADA VISÍVEL PARA SEPARAÇÃO
-- =========================================================

create or replace function public.separacao_pode_ver_retirada(
  p_retirada_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.retiradas_pedido r
    join public.pedidos p
      on p.id = r.pedido_id
    join public.perfil_cliente pc
      on pc.user_id = auth.uid()
    where r.id = p_retirada_id
      and pc.ativo = true
      and pc.tipo_usuario = 'separacao'
      and p.status_pagamento = 'aprovado'
      and r.status in (
        'recebido',
        'em_separacao',
        'pronto_retirada'
      )
      and (
        pc.unidade_id is null
        or r.unidade_id = pc.unidade_id
      )
  );
$$;

revoke all
on function public.separacao_pode_ver_retirada(uuid)
from public;

grant execute
on function public.separacao_pode_ver_retirada(uuid)
to authenticated;


-- =========================================================
-- 4. PEDIDOS
-- =========================================================

create policy
  "Separacao pode consultar pedidos operacionais"
on public.pedidos
for select
to authenticated
using (
  public.separacao_pode_ver_pedido(id)
);


-- =========================================================
-- 5. RETIRADAS
-- =========================================================

create policy
  "Separacao pode consultar retiradas operacionais"
on public.retiradas_pedido
for select
to authenticated
using (
  public.separacao_pode_ver_retirada(id)
);


-- =========================================================
-- 6. ITENS DA RETIRADA
-- =========================================================

create policy
  "Separacao pode consultar itens das retiradas"
on public.itens_retirada
for select
to authenticated
using (
  public.separacao_pode_ver_retirada(retirada_id)
);


-- =========================================================
-- 7. ITENS DO PEDIDO
-- =========================================================

create policy
  "Separacao pode consultar itens dos pedidos"
on public.itens_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.itens_retirada ir
    where ir.item_pedido_id = itens_pedido.id
      and public.separacao_pode_ver_retirada(ir.retirada_id)
  )
);


-- =========================================================
-- 8. GARANTE SELECT
-- =========================================================

grant select on public.pedidos to authenticated;
grant select on public.retiradas_pedido to authenticated;
grant select on public.itens_retirada to authenticated;
grant select on public.itens_pedido to authenticated;


-- =========================================================
-- 9. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   tablename,
--   policyname,
--   cmd
-- from pg_policies
-- where schemaname = 'public'
--   and policyname like 'Separacao%'
-- order by tablename, policyname;
--
-- =========================================================
