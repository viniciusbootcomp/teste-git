-- =========================================================
-- O BOX DRIVER
-- Proteção contra pagamentos concorrentes na mesma reserva
--
-- Objetivo:
--
-- impedir que uma mesma reserva possua ao mesmo tempo
-- mais de um pagamento ativo, por exemplo:
--
-- - PIX pendente + cartão pendente
-- - cartão processando + novo PIX
-- - dois cartões processando simultaneamente
--
-- Pagamentos recusados/cancelados/estornados não bloqueiam
-- uma nova tentativa.
-- =========================================================


-- =========================================================
-- 1. ÍNDICE ÚNICO PARCIAL
-- =========================================================

create unique index if not exists
ux_pagamentos_reserva_pagamento_ativo
on public.pagamentos (
  reserva_id
)
where
  reserva_id is not null
  and status in (
    'pendente',
    'processando',
    'aprovado'
  );


-- =========================================================
-- 2. COMENTÁRIO DE DOCUMENTAÇÃO
-- =========================================================

comment on index
public.ux_pagamentos_reserva_pagamento_ativo
is
'Garante no máximo um pagamento ativo por reserva. Evita concorrência entre PIX e cartão e duplicidade de tentativas ativas.';
