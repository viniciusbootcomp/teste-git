-- =========================================================
-- O BOX DRIVER
-- Preparação de pagamento com CARTÃO DE CRÉDITO
--
-- Responsabilidades:
--
-- - validar reserva ativa
-- - impedir extensão infinita por refresh/reenvio
-- - calcular valor usando snapshot da reserva
-- - garantir prazo mínimo para conclusão do cartão
-- - criar pagamento local
-- - gerar external_reference
-- - gerar idempotency_key
-- - reutilizar pagamento de crédito já existente
--
-- NÃO chama Mercado Pago.
-- NÃO recebe dados de cartão.
-- =========================================================


create or replace function
public.preparar_pagamento_cartao_credito(
  p_reserva_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva public.reservas_estoque%rowtype;

  v_pagamento public.pagamentos%rowtype;

  v_tempo_credito integer;

  v_valor numeric(12,2);

  v_expira_em timestamptz;

  v_pagamento_id uuid;

  v_external_reference text;

  v_idempotency_key uuid;
begin

  -- =====================================================
  -- 1. TRAVA A RESERVA
  -- =====================================================

  select *
  into v_reserva
  from public.reservas_estoque
  where id = p_reserva_id
  for update;


  if not found then
    raise exception
      'Reserva não encontrada';
  end if;


  -- =====================================================
  -- 2. RESERVA PRECISA ESTAR ATIVA
  -- =====================================================

  if v_reserva.status <> 'ativa' then
    raise exception
      'Reserva não está ativa';
  end if;


  if v_reserva.expira_em <= now() then

    update public.reservas_estoque
    set status = 'expirada'
    where id = v_reserva.id;

    raise exception
      'Reserva expirada';

  end if;


  -- =====================================================
  -- 3. VERIFICA SE JÁ EXISTE PAGAMENTO DE CRÉDITO ATIVO
  --
  -- Se o cliente reenviar a tentativa de pagamento,
  -- reaproveitamos o mesmo registro local e a mesma
  -- idempotency_key.
  --
  -- Isso evita criar vários pagamentos locais para a
  -- mesma reserva.
  -- =====================================================

  select *
  into v_pagamento
  from public.pagamentos
  where reserva_id = v_reserva.id
    and metodo = 'credit'
    and status in (
      'pendente',
      'processando',
      'aprovado'
    )
  order by created_at desc
  limit 1;


  if found then

    return jsonb_build_object(
      'sucesso', true,
      'reutilizado', true,

      'pagamento_id',
        v_pagamento.id,

      'reserva_id',
        v_pagamento.reserva_id,

      'status',
        v_pagamento.status,

      'valor',
        v_pagamento.valor,

      'external_reference',
        v_pagamento.external_reference,

      'idempotency_key',
        v_pagamento.idempotency_key,

      'expira_em',
        v_pagamento.expira_em_provedor,

      'order_id_provedor',
        v_pagamento.order_id_provedor,

      'payment_id_provedor',
        v_pagamento.payment_id_provedor,

      'status_detail',
        v_pagamento.status_detail
    );

  end if;


  -- =====================================================
  -- 4. LÊ TEMPO CONFIGURADO PARA CARTÃO DE CRÉDITO
  -- =====================================================

  select
    valor::integer
  into
    v_tempo_credito
  from public.configuracoes_sistema
  where chave =
    'tempo_reserva_credito_minutos';


  if
    v_tempo_credito is null
    or v_tempo_credito < 1
  then
    raise exception
      'Tempo de reserva para cartão de crédito inválido';
  end if;


  -- =====================================================
  -- 5. CALCULA VALOR OFICIAL
  --
  -- Nunca usamos preço enviado pelo navegador.
  --
  -- O valor vem do snapshot congelado na reserva.
  -- =====================================================

  select
    coalesce(
      sum(
        quantidade *
        preco_unitario
      ),
      0
    )::numeric(12,2)

  into v_valor

  from public.itens_reserva_estoque

  where reserva_id =
    v_reserva.id;


  if
    v_valor is null
    or v_valor <= 0
  then
    raise exception
      'Valor da reserva inválido';
  end if;


  -- =====================================================
  -- 6. DEFINE EXPIRAÇÃO DO PAGAMENTO
  --
  -- Não reduzimos um prazo de reserva que já seja maior.
  -- Apenas garantimos, no mínimo, o tempo configurado
  -- para o processamento do cartão.
  -- =====================================================

  v_expira_em :=
    greatest(
      v_reserva.expira_em,
      now() +
      make_interval(
        mins => v_tempo_credito
      )
    );


  -- =====================================================
  -- 7. ATUALIZA PRAZO DA RESERVA
  --
  -- A alteração só acontece quando ainda NÃO existe um
  -- pagamento de crédito ativo para esta reserva.
  --
  -- Reenvios posteriores reutilizam o registro localizado
  -- na etapa 3 e não renovam o prazo indefinidamente.
  -- =====================================================

  update public.reservas_estoque

  set expira_em =
    v_expira_em

  where id =
    v_reserva.id;


  -- =====================================================
  -- 8. IDENTIFICADORES
  -- =====================================================

  v_pagamento_id :=
    gen_random_uuid();


  v_idempotency_key :=
    gen_random_uuid();


  v_external_reference :=
    'obox_cc_' ||
    replace(
      v_pagamento_id::text,
      '-',
      ''
    );


  -- =====================================================
  -- 9. CRIA PAGAMENTO LOCAL
  -- =====================================================

  insert into public.pagamentos (
    id,
    user_id,
    reserva_id,
    pedido_id,

    provedor,
    metodo,
    status,

    valor,
    moeda,

    payment_id_provedor,
    order_id_provedor,

    external_reference,
    idempotency_key,

    expira_em_provedor,

    status_detail
  )
  values (
    v_pagamento_id,
    v_reserva.user_id,
    v_reserva.id,
    null,

    'mercado_pago',
    'credit',
    'pendente',

    v_valor,
    'BRL',

    null,
    null,

    v_external_reference,
    v_idempotency_key,

    v_expira_em,

    'aguardando_criacao_order'
  );


  -- =====================================================
  -- 10. RETORNO PARA O BACKEND
  -- =====================================================

  return jsonb_build_object(
    'sucesso', true,
    'reutilizado', false,

    'pagamento_id',
      v_pagamento_id,

    'reserva_id',
      v_reserva.id,

    'status',
      'pendente',

    'valor',
      v_valor,

    'external_reference',
      v_external_reference,

    'idempotency_key',
      v_idempotency_key,

    'expira_em',
      v_expira_em
  );

end;
$$;


-- =========================================================
-- SEGURANÇA
--
-- O navegador NÃO pode preparar pagamentos diretamente.
--
-- Somente nosso backend.
-- =========================================================

revoke all
on function public.preparar_pagamento_cartao_credito(uuid)
from public;

revoke all
on function public.preparar_pagamento_cartao_credito(uuid)
from anon;

revoke all
on function public.preparar_pagamento_cartao_credito(uuid)
from authenticated;

grant execute
on function public.preparar_pagamento_cartao_credito(uuid)
to service_role;
