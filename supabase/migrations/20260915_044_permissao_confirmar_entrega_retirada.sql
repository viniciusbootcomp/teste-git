-- =========================================================
-- 044 - PERMISSÃO OPERACIONAL PARA CONFIRMAR ENTREGA
-- O Box Driver - Homologação / Fase 1
--
-- Objetivo:
-- permitir que qualquer usuário com capacidade operacional
-- "retirada" possa confirmar a entrega física.
--
-- Admin e admin_rede continuam autorizados porque a função
-- usuario_atual_tem_permissao('retirada') já contempla ambos.
-- =========================================================


create or replace function public.confirmar_entrega_retirada(
  p_retirada_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_pedido_id uuid;
  v_numero_pedido bigint;

  v_sequencia integer;
  v_status_retirada text;

  v_unidade_id uuid;
  v_unidade_usuario uuid;
begin

  -- -------------------------------------------------------
  -- Usuário autenticado
  -- -------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuário não autenticado';
  end if;


  -- -------------------------------------------------------
  -- Permissão operacional
  -- -------------------------------------------------------

  if not public.usuario_atual_tem_permissao(
    'retirada'
  ) then
    raise exception
      'Usuário sem permissão para confirmar entrega';
  end if;


  -- -------------------------------------------------------
  -- Unidade vinculada ao usuário
  --
  -- null = operação atual/global de homologação.
  -- Quando houver unidade definida, ela deve coincidir
  -- com a unidade da retirada.
  -- -------------------------------------------------------

  select
    pc.unidade_id
  into
    v_unidade_usuario
  from public.perfil_cliente pc
  where pc.user_id = v_user_id
    and pc.ativo = true
  limit 1;


  -- -------------------------------------------------------
  -- Busca e trava retirada
  -- -------------------------------------------------------

  select
    r.pedido_id,
    p.numero_pedido,
    r.sequencia,
    r.status,
    r.unidade_id

  into
    v_pedido_id,
    v_numero_pedido,
    v_sequencia,
    v_status_retirada,
    v_unidade_id

  from public.retiradas_pedido r

  join public.pedidos p
    on p.id = r.pedido_id

  where r.id = p_retirada_id

  for update of r;


  if not found then
    raise exception
      'Retirada não encontrada';
  end if;


  -- -------------------------------------------------------
  -- Validação da unidade
  -- -------------------------------------------------------

  if
    v_unidade_usuario is not null
    and v_unidade_id <> v_unidade_usuario
  then
    raise exception
      'Usuário não possui permissão para operar esta unidade';
  end if;


  -- -------------------------------------------------------
  -- Validações de status
  -- -------------------------------------------------------

  if v_status_retirada = 'entregue' then
    raise exception
      'Retirada % do Pedido nº % já foi entregue',
      v_sequencia,
      v_numero_pedido;
  end if;


  if v_status_retirada <> 'cliente_no_local' then
    raise exception
      'Retirada % do Pedido nº % não pode ser entregue. Status atual: %',
      v_sequencia,
      v_numero_pedido,
      v_status_retirada;
  end if;


  -- -------------------------------------------------------
  -- Confirma entrega física
  -- -------------------------------------------------------

  update public.retiradas_pedido

  set
    status = 'entregue',
    entregue_em = now(),
    entregue_por = v_user_id

  where id = p_retirada_id;


  -- -------------------------------------------------------
  -- Histórico
  -- -------------------------------------------------------

  insert into public.historico_pedido (
    pedido_id,
    retirada_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    p_retirada_id,
    v_user_id,
    'entrega_confirmada',
    'cliente_no_local',
    'entregue',
    'Entrega física da retirada confirmada'
  );


  -- -------------------------------------------------------
  -- Retorno
  -- -------------------------------------------------------

  return jsonb_build_object(
    'sucesso', true,
    'pedido', v_numero_pedido,
    'retirada', v_sequencia,
    'retirada_id', p_retirada_id,
    'unidade_id', v_unidade_id,
    'status', 'entregue'
  );

end;
$$;


revoke all
on function public.confirmar_entrega_retirada(uuid)
from public;

grant execute
on function public.confirmar_entrega_retirada(uuid)
to authenticated;