-- =========================================================
-- O BOX DRIVER
-- Normalização de status operacionais
-- =========================================================


-- =========================================================
-- 1. NORMALIZA STATUS DE RETIRADAS
-- =========================================================

update public.retiradas_pedido
set status = 'em_separacao'
where status in (
  'em separação',
  'em-separacao',
  'emseparacao'
);


update public.retiradas_pedido
set status = 'pronto_retirada'
where status in (
  'pronto',
  'pronto retirada',
  'pronto-retirada'
);


update public.retiradas_pedido
set status = 'cliente_no_local'
where status in (
  'cliente no local',
  'cliente-no-local'
);


-- =========================================================
-- 2. CRIA REGRA DE VALIDAÇÃO DOS STATUS
--
-- Não usamos ENUM agora para manter flexibilidade.
-- Usamos CHECK, que é mais fácil de evoluir.
-- =========================================================

alter table public.retiradas_pedido
drop constraint if exists retiradas_pedido_status_check;


alter table public.retiradas_pedido
add constraint retiradas_pedido_status_check
check (
  status in (
    'recebido',
    'em_separacao',
    'pronto_retirada',
    'cliente_no_local',
    'entregue',
    'cancelado'
  )
);


-- =========================================================
-- 3. STATUS DE PAGAMENTO
-- =========================================================

alter table public.pedidos
drop constraint if exists pedidos_status_pagamento_check;


alter table public.pedidos
add constraint pedidos_status_pagamento_check
check (
  status_pagamento in (
    'pendente',
    'aprovado',
    'recusado',
    'cancelado',
    'estornado'
  )
);