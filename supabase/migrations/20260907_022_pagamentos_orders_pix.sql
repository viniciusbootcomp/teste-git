-- =========================================================
-- O BOX DRIVER
-- Preparação de pagamentos para Mercado Pago Orders API
--
-- Inclui:
-- - ID da Order no Mercado Pago
-- - dados persistentes do PIX
-- - vencimento informado pelo provedor
-- - parâmetros de reserva por meio de pagamento
-- =========================================================


-- =========================================================
-- 1. CAMPOS DA ORDER MERCADO PAGO
-- =========================================================

alter table public.pagamentos
add column if not exists
  order_id_provedor text null;


alter table public.pagamentos
add column if not exists
  expira_em_provedor timestamptz null;


-- =========================================================
-- 2. DADOS DO PIX
--
-- Precisamos persistir esses dados para que o cliente
-- possa atualizar/reabrir a página sem perder o QR Code.
-- =========================================================

alter table public.pagamentos
add column if not exists
  pix_qr_code text null;


alter table public.pagamentos
add column if not exists
  pix_qr_code_base64 text null;


alter table public.pagamentos
add column if not exists
  pix_ticket_url text null;


-- =========================================================
-- 3. ÍNDICE DA ORDER DO PROVEDOR
-- =========================================================

create unique index if not exists
  uq_pagamentos_order_id_provedor
on public.pagamentos(order_id_provedor)
where order_id_provedor is not null;


-- =========================================================
-- 4. PARÂMETROS DE RESERVA POR MÉTODO
-- =========================================================
--
-- PIX:
-- Mercado Pago exige vencimento mínimo de 30 minutos.
--
-- Cartões:
-- mantemos inicialmente 10 minutos.
-- =========================================================

insert into public.configuracoes_sistema (
  chave,
  valor,
  descricao,
  updated_at
)
values
(
  'tempo_reserva_pix_minutos',
  '30',
  'Tempo de reserva de estoque para pagamentos via PIX',
  now()
)
on conflict (chave)
do update set
  valor = excluded.valor,
  descricao = excluded.descricao,
  updated_at = now();


insert into public.configuracoes_sistema (
  chave,
  valor,
  descricao,
  updated_at
)
values
(
  'tempo_reserva_credito_minutos',
  '10',
  'Tempo de reserva de estoque para pagamentos com cartão de crédito',
  now()
)
on conflict (chave)
do update set
  valor = excluded.valor,
  descricao = excluded.descricao,
  updated_at = now();


insert into public.configuracoes_sistema (
  chave,
  valor,
  descricao,
  updated_at
)
values
(
  'tempo_reserva_debito_minutos',
  '10',
  'Tempo de reserva de estoque para pagamentos com cartão de débito',
  now()
)
on conflict (chave)
do update set
  valor = excluded.valor,
  descricao = excluded.descricao,
  updated_at = now();