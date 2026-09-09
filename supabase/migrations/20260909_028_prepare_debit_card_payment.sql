-- =========================================================
-- O BOX DRIVER
-- Preparação de pagamento com CARTÃO DE DÉBITO
-- =========================================================

create or replace function
public.preparar_pagamento_cartao_debito(
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
  v_tempo_debito integer;
  v_valor numeric(12,2);
  v_expira_em timestamptz;
  v_pagamento_id uuid;
  v_external_reference text;
  v_idempotency_key uuid;
begin

  select *
  into v_reserva
  from public.reservas_estoque
  where id = p_reserva_id
  for update;

  if not found then
    raise exception
      'Reserva não encontrada';
  end if;

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

  select *
  into v_pagamento
  from public.pagamentos
  where reserva_id = v_reserva.id
    and metodo = 'debit_card'
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

  select
    valor::integer
  into
    v_tempo_debito
  from public.configuracoes_sistema
  where chave =
    'tempo_reserva_debito_minutos';

  if
    v_tempo_debito is null
    or v_tempo_debito < 1
  then
    raise exception
      'Tempo de reserva para cartão de débito inválido';
  end if;

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

  v_expira_em :=
    greatest(
      v_reserva.expira_em,
      now() +
      make_interval(
        mins => v_tempo_debito
      )
    );

  update public.reservas_estoque
  set expira_em =
    v_expira_em
  where id =
    v_reserva.id;

  v_pagamento_id :=
    gen_random_uuid();

  v_idempotency_key :=
    gen_random_uuid();

  v_external_reference :=
    'obox_dc_' ||
    replace(
      v_pagamento_id::text,
      '-',
      ''
    );

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
    'debit_card',
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


revoke all
on function public.preparar_pagamento_cartao_debito(uuid)
from public;

revoke all
on function public.preparar_pagamento_cartao_debito(uuid)
from anon;

revoke all
on function public.preparar_pagamento_cartao_debito(uuid)
from authenticated;

grant execute
on function public.preparar_pagamento_cartao_debito(uuid)
to service_role;