-- =========================================================
-- 040 - RLS DE LEITURA PARA O PERFIL SEPARAÇÃO
-- O Box Driver - Homologação / Fase 1
--
-- Objetivo:
-- permitir que usuários ativos com tipo_usuario = 'separacao'
-- consultem somente os pedidos e dados operacionais necessários
-- à separação, sem conceder acesso administrativo geral.
--
-- Regra atual de unidade:
-- - se perfil_cliente.unidade_id estiver preenchido, limita à unidade;
-- - se estiver NULL, permite acesso às retiradas operacionais elegíveis.
--   Isto mantém compatibilidade com o cenário atual de uma unidade.
-- =========================================================


-- =========================================================
-- 1. PEDIDOS
-- =========================================================

drop policy if exists
  "Separacao pode consultar pedidos operacionais"
on public.pedidos;

create policy
  "Separacao pode consultar pedidos operacionais"
on public.pedidos
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and pc.tipo_usuario = 'separacao'
      and exists (
        select 1
        from public.retiradas_pedido r
        where r.pedido_id = pedidos.id
          and r.status in (
            'recebido',
            'em_separacao',
            'pronto_retirada'
          )
          and (
            pc.unidade_id is null
            or r.unidade_id = pc.unidade_id
          )
      )
  )
);


-- =========================================================
-- 2. RETIRADAS
-- =========================================================

drop policy if exists
  "Separacao pode consultar retiradas operacionais"
on public.retiradas_pedido;

create policy
  "Separacao pode consultar retiradas operacionais"
on public.retiradas_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    join public.pedidos p
      on p.id = retiradas_pedido.pedido_id
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and pc.tipo_usuario = 'separacao'
      and p.status_pagamento = 'aprovado'
      and retiradas_pedido.status in (
        'recebido',
        'em_separacao',
        'pronto_retirada'
      )
      and (
        pc.unidade_id is null
        or retiradas_pedido.unidade_id = pc.unidade_id
      )
  )
);


-- =========================================================
-- 3. ITENS DA RETIRADA
-- =========================================================

drop policy if exists
  "Separacao pode consultar itens das retiradas"
on public.itens_retirada;

create policy
  "Separacao pode consultar itens das retiradas"
on public.itens_retirada
for select
to authenticated
using (
  exists (
    select 1
    from public.retiradas_pedido r
    join public.pedidos p
      on p.id = r.pedido_id
    join public.perfil_cliente pc
      on pc.user_id = auth.uid()
    where r.id = itens_retirada.retirada_id
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
  )
);


-- =========================================================
-- 4. ITENS DO PEDIDO
-- =========================================================

drop policy if exists
  "Separacao pode consultar itens dos pedidos"
on public.itens_pedido;

create policy
  "Separacao pode consultar itens dos pedidos"
on public.itens_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.itens_retirada ir
    join public.retiradas_pedido r
      on r.id = ir.retirada_id
    join public.pedidos p
      on p.id = r.pedido_id
    join public.perfil_cliente pc
      on pc.user_id = auth.uid()
    where ir.item_pedido_id = itens_pedido.id
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
  )
);


-- =========================================================
-- 5. GARANTE PRIVILÉGIO DE SELECT AO ROLE AUTHENTICATED
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


-- =========================================================
-- 6. CONSULTA DE VERIFICAÇÃO OPCIONAL
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
