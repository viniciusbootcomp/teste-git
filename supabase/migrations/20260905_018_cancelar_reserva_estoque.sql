-- =========================================================
-- O BOX DRIVER
-- Cancelamento manual de reserva de estoque
--
-- Objetivo:
-- quando o cliente altera o carrinho durante uma
-- reserva ativa, cancelamos a reserva antiga e liberamos
-- imediatamente a disponibilidade para a rede.
-- =========================================================

create or replace function public.cancelar_reserva_estoque(
  p_reserva_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_reserva public.reservas_estoque%rowtype;
begin

  -- =====================================================
  -- 1. USUÁRIO AUTENTICADO
  -- =====================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuário não autenticado';
  end if;


  -- =====================================================
  -- 2. TRAVA A RESERVA
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
  -- 3. GARANTE QUE A RESERVA É DO PRÓPRIO CLIENTE
  -- =====================================================

  if v_reserva.user_id <> v_user_id then
    raise exception
      'Reserva não pertence ao usuário autenticado';
  end if;


  -- =====================================================
  -- 4. SE JÁ ESTIVER CANCELADA
  -- =====================================================

  if v_reserva.status = 'cancelada' then
    return true;
  end if;


  -- =====================================================
  -- 5. RESERVA JÁ CONVERTIDA NÃO PODE SER CANCELADA
  -- =====================================================

  if v_reserva.status = 'convertida' then
    raise exception
      'Reserva já convertida em pedido';
  end if;


  -- =====================================================
  -- 6. RESERVA EXPIRADA
  --
  -- Se o prazo já acabou, apenas formalizamos o status
  -- como expirada.
  -- =====================================================

  if
    v_reserva.status = 'ativa'
    and v_reserva.expira_em <= now()
  then

    update public.reservas_estoque
    set status = 'expirada'
    where id = v_reserva.id;

    return true;

  end if;


  -- =====================================================
  -- 7. CANCELA RESERVA ATIVA
  --
  -- IMPORTANTE:
  --
  -- Não existe devolução física de estoque aqui.
  --
  -- A reserva nunca reduziu estoque_unidade.quantidade.
  -- Ao mudar o status de ativa para cancelada, ela
  -- simplesmente deixa de participar da disponibilidade.
  -- =====================================================

  if v_reserva.status = 'ativa' then

    update public.reservas_estoque
    set
      status = 'cancelada',
      cancelada_em = now()
    where id = v_reserva.id;

    return true;

  end if;


  -- =====================================================
  -- 8. OUTROS STATUS
  -- =====================================================

  raise exception
    'Reserva não pode ser cancelada no status atual: %',
    v_reserva.status;

end;
$$;


-- =========================================================
-- PERMISSÕES
-- =========================================================

revoke all
on function public.cancelar_reserva_estoque(uuid)
from public;

grant execute
on function public.cancelar_reserva_estoque(uuid)
to authenticated;