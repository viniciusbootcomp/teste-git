-- =========================================================
-- O BOX DRIVER
-- Preparação de pagamento PIX
--
-- Responsabilidades:
--
-- - validar reserva ativa
-- - impedir extensão infinita por refresh
-- - calcular valor usando snapshot da reserva
-- - estender reserva para o prazo do PIX
-- - criar pagamento local
-- - gerar external_reference
-- - gerar idempotency_key
-- - reutilizar pagamento PIX já existente
--
-- NÃO chama Mercado Pago.
-- =========================================================


create or replace function
public.preparar_pagamento_pix(
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

  v_tempo_pix integer;

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
  -- 3. VERIFICA SE JÁ EXISTE PIX ATIVO
  --
  -- Muito importante:
  --
  -- se o cliente der refresh ou clicar novamente,
  -- NÃO criamos outro pagamento e NÃO renovamos
  -- os 30 minutos.
  -- =====================================================

  select *
  into v_pagamento
  from public.pagamentos
  where reserva_id = v_reserva.id
    and metodo = 'pix'
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

      'pix_qr_code',
        v_pagamento.pix_qr_code,

      'pix_qr_code_base64',
        v_pagamento.pix_qr_code_base64,

      'pix_ticket_url',
        v_pagamento.pix_ticket_url
    );

  end if;


  -- =====================================================
  -- 4. LÊ TEMPO CONFIGURADO PARA PIX
  -- =====================================================

  select
    valor::integer
  into
    v_tempo_pix
  from public.configuracoes_sistema
  where chave =
    'tempo_reserva_pix_minutos';


  if
    v_tempo_pix is null
    or v_tempo_pix < 30
  then
    raise exception
      'Tempo de reserva PIX inválido. Mínimo: 30 minutos';
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
  -- 6. DEFINE EXPIRAÇÃO DO PIX
  -- =====================================================

  v_expira_em :=
    now() +
    make_interval(
      mins => v_tempo_pix
    );


  -- =====================================================
  -- 7. ESTENDE A RESERVA
  --
  -- Isso acontece apenas na PRIMEIRA criação do PIX.
  --
  -- Refresh não passa por aqui porque o pagamento
  -- existente é reaproveitado acima.
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


  /*
   * Mantemos curto e compatível com external_reference.
   *
   * Exemplo:
   *
   * obox_pix_1234567890abcdef...
   */
  v_external_reference :=
    'obox_pix_' ||
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
    'pix',
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
on function public.preparar_pagamento_pix(uuid)
from public;

revoke all
on function public.preparar_pagamento_pix(uuid)
from anon;

revoke all
on function public.preparar_pagamento_pix(uuid)
from authenticated;

grant execute
on function public.preparar_pagamento_pix(uuid)
to service_role;