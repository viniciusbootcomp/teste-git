-- =========================================================
-- 036 - NOTIFICAÇÃO AUTOMÁTICA: PEDIDO PAGO -> SEPARAÇÃO
-- O Box Driver - Protótipo / Sandbox
--
-- Decisão de arquitetura:
-- A notificação nasce quando o pagamento local muda para
-- status = 'aprovado' e já possui pedido_id.
--
-- Isso é mais seguro do que acoplar a regra diretamente ao
-- webhook do Mercado Pago, porque também cobre outros fluxos
-- legítimos que possam aprovar/reconciliar o pagamento.
-- =========================================================


-- =========================================================
-- 1. GARANTE IDEMPOTÊNCIA
-- =========================================================
--
-- Para um mesmo pedido, não queremos gerar duas notificações
-- "pedido_pago" para o perfil separacao.
-- =========================================================

create unique index if not exists
  ux_notificacoes_pedido_pago_separacao
on public.notificacoes (
  tipo,
  pedido_id,
  perfil_destino
)
where
  tipo = 'pedido_pago'
  and pedido_id is not null
  and perfil_destino = 'separacao';


-- =========================================================
-- 2. FUNÇÃO DO TRIGGER
-- =========================================================

create or replace function public.notificar_separacao_pagamento_aprovado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só cria quando o pagamento estiver aprovado e vinculado
  -- a um pedido.
  if new.status = 'aprovado'
     and new.pedido_id is not null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'aprovado'
       or old.pedido_id is distinct from new.pedido_id
     )
  then

    insert into public.notificacoes (
      titulo,
      mensagem,
      tipo,
      perfil_destino,
      pedido_id,
      link,
      lida,
      lida_em,
      criada_por_user_id
    )
    values (
      'Novo pedido pago',
      'O pedido #' || new.pedido_id::text || ' foi pago e está aguardando separação.',
      'pedido_pago',
      'separacao',
      new.pedido_id,
      '/admin/pedidos',
      false,
      null,
      null
    )
    on conflict do nothing;

  end if;

  return new;
end;
$$;


-- =========================================================
-- 3. TRIGGER
-- =========================================================

drop trigger if exists
  trg_notificar_separacao_pagamento_aprovado
on public.pagamentos;

create trigger trg_notificar_separacao_pagamento_aprovado
after insert or update of status, pedido_id
on public.pagamentos
for each row
execute function public.notificar_separacao_pagamento_aprovado();


-- =========================================================
-- 4. COMENTÁRIOS
-- =========================================================

comment on function public.notificar_separacao_pagamento_aprovado()
is
'Cria uma notificação interna para o perfil separacao quando um pagamento fica aprovado e possui pedido_id.';


-- =========================================================
-- 5. TESTE / VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- Depois de um pagamento real de teste:
--
-- select
--   id,
--   titulo,
--   mensagem,
--   tipo,
--   perfil_destino,
--   pedido_id,
--   lida,
--   created_at
-- from public.notificacoes
-- where tipo = 'pedido_pago'
-- order by created_at desc;
--
-- =========================================================
