-- =========================================================
-- 045 - REMOVE NOTIFICAÇÃO INTERNA ROTINEIRA DE PEDIDO PAGO
-- O Box Driver - Homologação / Fase 1
--
-- Decisão de arquitetura:
-- o painel operacional é a fonte de trabalho da equipe.
--
-- Eventos normais da operação não devem gerar notificações
-- internas, evitando alertas atrasados ou sem ação pendente.
--
-- Notificações internas ficam reservadas para exceções.
--
-- Esta migration:
-- - remove o trigger;
-- - remove a função;
-- - remove o índice específico;
-- - preserva notificações antigas como histórico.
-- =========================================================


-- =========================================================
-- 1. REMOVE TRIGGER
-- =========================================================

drop trigger if exists
  trg_notificar_separacao_pagamento_aprovado
on public.pagamentos;


-- =========================================================
-- 2. REMOVE FUNÇÃO
-- =========================================================

drop function if exists
  public.notificar_separacao_pagamento_aprovado();


-- =========================================================
-- 3. REMOVE ÍNDICE ESPECÍFICO
-- =========================================================

drop index if exists
  public.ux_notificacoes_pedido_pago_separacao;


-- =========================================================
-- 4. OBSERVAÇÃO
-- =========================================================
--
-- Registros antigos em public.notificacoes com:
--
-- tipo = 'pedido_pago'
--
-- NÃO são excluídos.
--
-- Eles permanecem como histórico da homologação.
--
-- =========================================================