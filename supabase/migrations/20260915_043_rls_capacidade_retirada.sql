-- =========================================================
-- 043 - RLS PARA CAPACIDADE OPERACIONAL DE RETIRADA
-- O Box Driver - Homologação / Fase 1
--
-- Objetivo:
-- permitir que usuários com capacidade "retirada"
-- enxerguem retiradas após o check-in do cliente.
--
-- Cenário:
-- usuário pode ter perfil principal "separacao"
-- e também capacidade adicional "retirada".
--
-- Após o check-in:
-- status = cliente_no_local
--
-- A RLS anterior permitia apenas:
-- recebido
-- em_separacao
-- pronto_retirada
--
-- =========================================================


-- =========================================================
-- 1. FUNÇÃO - RETIRADA VISÍVEL PARA OPERAÇÃO
-- =========================================================

create or replace function public.operacao_pode_ver_retirada(
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

      and p.status_pagamento = 'aprovado'

      and (

        (
          public.usuario_atual_tem_permissao(
            'separacao'
          )

          and r.status in (
            'recebido',
            'em_separacao',
            'pronto_retirada'
          )
        )

        or

        (
          public.usuario_atual_tem_permissao(
            'retirada'
          )

          and r.status in (
            'pronto_retirada',
            'cliente_no_local',
            'entregue'
          )
        )

      )

      and (
        pc.unidade_id is null
        or r.unidade_id = pc.unidade_id
      )

  );
$$;


revoke all
on function public.operacao_pode_ver_retirada(uuid)
from public;

grant execute
on function public.operacao_pode_ver_retirada(uuid)
to authenticated;


-- =========================================================
-- 2. FUNÇÃO - PEDIDO VISÍVEL PARA OPERAÇÃO
-- =========================================================

create or replace function public.operacao_pode_ver_pedido(
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

    from public.retiradas_pedido r

    where r.pedido_id = p_pedido_id

      and public.operacao_pode_ver_retirada(
        r.id
      )

  );

$$;


revoke all
on function public.operacao_pode_ver_pedido(uuid)
from public;

grant execute
on function public.operacao_pode_ver_pedido(uuid)
to authenticated;


-- =========================================================
-- 3. REMOVE POLICIES ANTIGAS
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
-- 4. PEDIDOS
-- =========================================================

create policy
  "Operacao pode consultar pedidos"
on public.pedidos
for select
to authenticated
using (
  public.operacao_pode_ver_pedido(id)
);


-- =========================================================
-- 5. RETIRADAS
-- =========================================================

create policy
  "Operacao pode consultar retiradas"
on public.retiradas_pedido
for select
to authenticated
using (
  public.operacao_pode_ver_retirada(id)
);


-- =========================================================
-- 6. ITENS DA RETIRADA
-- =========================================================

create policy
  "Operacao pode consultar itens retirada"
on public.itens_retirada
for select
to authenticated
using (
  public.operacao_pode_ver_retirada(
    retirada_id
  )
);


-- =========================================================
-- 7. ITENS DO PEDIDO
-- =========================================================

create policy
  "Operacao pode consultar itens pedido"
on public.itens_pedido
for select
to authenticated
using (

  exists (

    select 1

    from public.itens_retirada ir

    where ir.item_pedido_id =
      itens_pedido.id

      and
      public.operacao_pode_ver_retirada(
        ir.retirada_id
      )

  )

);


-- =========================================================
-- 8. GRANTS
-- =========================================================

grant select
on public.pedidos
to authenticated;

grant select
on public.retiradas_pedido
to authenticated;

grant select
on public.itens_retirada
to authenticated;

grant select
on public.itens_pedido
to authenticated;