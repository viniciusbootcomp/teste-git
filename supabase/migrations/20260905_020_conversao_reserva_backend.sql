-- =========================================================
-- O BOX DRIVER
-- Conversão de reserva executada pelo backend
--
-- A função é exclusiva do service_role.
--
-- A autenticação/autorização do cliente passa a ser
-- responsabilidade da API antes de chamar esta função.
-- =========================================================

create or replace function public.converter_reserva_em_pedido(
  p_reserva_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva public.reservas_estoque%rowtype;

  v_item record;
  v_unidade record;

  v_pedido_id uuid;
  v_numero_pedido bigint;

  v_item_pedido_id uuid;
  v_retirada_id uuid;
  v_ponto_retirada_id uuid;

  v_total numeric(12,2) := 0;

  v_sequencia integer := 0;

  v_unidades_utilizadas uuid[] :=
    array[]::uuid[];

  v_quantidade_unidades integer;

  v_unidade_unica_id uuid;
  v_ponto_unico_id uuid;
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
  -- 2. STATUS
  -- =====================================================

  if v_reserva.status = 'convertida' then

    /*
     * Idempotência:
     * se já converteu, devolvemos o pedido existente.
     */

    if v_reserva.pedido_id is null then
      raise exception
        'Reserva convertida sem pedido vinculado';
    end if;


    select numero_pedido
    into v_numero_pedido
    from public.pedidos
    where id = v_reserva.pedido_id;


    if v_numero_pedido is null then
      raise exception
        'Pedido da reserva convertida não encontrado';
    end if;


    return v_numero_pedido;

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


  -- =====================================================
  -- 3. GARANTE ITENS
  -- =====================================================

  if not exists (
    select 1
    from public.itens_reserva_estoque ire
    where ire.reserva_id = v_reserva.id
  ) then
    raise exception
      'Reserva não possui itens';
  end if;


  -- =====================================================
  -- 4. TRAVA ESTOQUE FÍSICO
  -- =====================================================

  perform eu.id
  from public.estoque_unidade eu

  join public.itens_reserva_estoque ire
    on ire.unidade_id = eu.unidade_id
   and ire.produto_id = eu.produto_id

  where ire.reserva_id = v_reserva.id

  order by
    eu.produto_id,
    eu.unidade_id

  for update of eu;


  -- =====================================================
  -- 5. VALIDA ESTOQUE
  -- =====================================================

  for v_item in

    select
      ire.unidade_id,
      ire.produto_id,
      ire.quantidade,
      ire.nome_produto,
      ire.codigo_produto,
      ire.preco_unitario,
      eu.quantidade as estoque_fisico

    from public.itens_reserva_estoque ire

    join public.estoque_unidade eu
      on eu.unidade_id = ire.unidade_id
     and eu.produto_id = ire.produto_id

    where ire.reserva_id = v_reserva.id

  loop

    if v_item.estoque_fisico < v_item.quantidade then
      raise exception
        'Estoque físico inconsistente para %. Físico: %, reservado: %',
        v_item.nome_produto,
        v_item.estoque_fisico,
        v_item.quantidade;
    end if;


    if not (
      v_item.unidade_id =
      any(v_unidades_utilizadas)
    ) then

      v_unidades_utilizadas :=
        array_append(
          v_unidades_utilizadas,
          v_item.unidade_id
        );

    end if;

  end loop;


  v_quantidade_unidades :=
    coalesce(
      array_length(
        v_unidades_utilizadas,
        1
      ),
      0
    );


  if v_quantidade_unidades = 0 then
    raise exception
      'Nenhuma unidade encontrada na reserva';
  end if;


  -- =====================================================
  -- 6. TOTAL COMERCIAL
  -- =====================================================

  select
    coalesce(
      sum(
        x.quantidade_total *
        x.preco_unitario
      ),
      0
    )::numeric(12,2)

  into v_total

  from (
    select
      produto_id,
      preco_unitario,
      sum(quantidade)::numeric as quantidade_total

    from public.itens_reserva_estoque

    where reserva_id = v_reserva.id

    group by
      produto_id,
      preco_unitario
  ) x;


  -- =====================================================
  -- 7. COMPATIBILIDADE TEMPORÁRIA
  -- =====================================================

  if v_quantidade_unidades = 1 then

    v_unidade_unica_id :=
      v_unidades_utilizadas[1];


    select id
    into v_ponto_unico_id

    from public.pontos_retirada

    where unidade_id =
      v_unidade_unica_id

      and ativo = true

    order by created_at

    limit 1;


    if v_ponto_unico_id is null then
      raise exception
        'Unidade não possui ponto de retirada ativo';
    end if;

  else

    v_unidade_unica_id := null;
    v_ponto_unico_id := null;

  end if;


  -- =====================================================
  -- 8. CRIA PEDIDO
  --
  -- O dono do pedido vem da própria reserva.
  -- Não usamos mais auth.uid().
  -- =====================================================

  insert into public.pedidos (
    user_id,
    unidade_id,
    ponto_retirada_id,
    status,
    status_pagamento,
    total
  )
  values (
    v_reserva.user_id,
    v_unidade_unica_id,
    v_ponto_unico_id,
    'recebido',
    'aprovado',
    v_total
  )
  returning
    id,
    numero_pedido

  into
    v_pedido_id,
    v_numero_pedido;


  -- =====================================================
  -- 9. VINCULA RESERVA AO PEDIDO
  -- =====================================================

  update public.reservas_estoque
  set pedido_id = v_pedido_id
  where id = v_reserva.id;


  -- =====================================================
  -- 10. ITENS COMERCIAIS
  -- =====================================================

  for v_item in

    select
      produto_id,
      min(nome_produto) as nome_produto,
      min(codigo_produto) as codigo_produto,
      preco_unitario,
      sum(quantidade)::bigint as quantidade_total

    from public.itens_reserva_estoque

    where reserva_id =
      v_reserva.id

    group by
      produto_id,
      preco_unitario

    order by
      produto_id

  loop

    insert into public.itens_pedido (
      pedido_id,
      produto_id,
      nome_produto,
      codigo_produto,
      quantidade,
      preco_unitario,
      subtotal
    )
    values (
      v_pedido_id,
      v_item.produto_id,
      v_item.nome_produto,
      v_item.codigo_produto,
      v_item.quantidade_total,
      v_item.preco_unitario,
      v_item.quantidade_total *
        v_item.preco_unitario
    );

  end loop;


  -- =====================================================
  -- 11. RETIRADAS
  -- =====================================================

  for v_unidade in

    select
      u.id,
      u.codigo,
      u.nome

    from public.unidades u

    where u.id =
      any(v_unidades_utilizadas)

    order by u.codigo

  loop

    v_sequencia :=
      v_sequencia + 1;


    select id
    into v_ponto_retirada_id

    from public.pontos_retirada

    where unidade_id =
      v_unidade.id

      and ativo = true

    order by created_at

    limit 1;


    if v_ponto_retirada_id is null then
      raise exception
        'Unidade % não possui ponto de retirada ativo',
        v_unidade.nome;
    end if;


    insert into public.retiradas_pedido (
      pedido_id,
      sequencia,
      unidade_id,
      ponto_retirada_id,
      status
    )
    values (
      v_pedido_id,
      v_sequencia,
      v_unidade.id,
      v_ponto_retirada_id,
      'recebido'
    )
    returning id
    into v_retirada_id;


    -- ===================================================
    -- 12. ITENS DA RETIRADA
    -- ===================================================

    for v_item in

      select
        ire.produto_id,
        ire.quantidade

      from public.itens_reserva_estoque ire

      where ire.reserva_id =
        v_reserva.id

        and ire.unidade_id =
          v_unidade.id

      order by
        ire.produto_id

    loop

      select id
      into v_item_pedido_id

      from public.itens_pedido

      where pedido_id =
        v_pedido_id

        and produto_id =
          v_item.produto_id

      limit 1;


      if v_item_pedido_id is null then
        raise exception
          'Item comercial não encontrado';
      end if;


      insert into public.itens_retirada (
        retirada_id,
        item_pedido_id,
        quantidade,
        quantidade_separada
      )
      values (
        v_retirada_id,
        v_item_pedido_id,
        v_item.quantidade,
        0
      );


      -- =================================================
      -- 13. BAIXA FÍSICA
      -- =================================================

      update public.estoque_unidade

      set quantidade =
        quantidade -
        v_item.quantidade

      where unidade_id =
        v_unidade.id

        and produto_id =
          v_item.produto_id;


      if not found then
        raise exception
          'Estoque da unidade não encontrado';
      end if;

    end loop;

  end loop;


  -- =====================================================
  -- 14. CONVERTE RESERVA
  -- =====================================================

  update public.reservas_estoque
  set
    status = 'convertida',
    convertida_em = now()
  where id = v_reserva.id;


  -- =====================================================
  -- 15. CAMPO LEGADO produtos.estoque
  -- =====================================================

  for v_item in

    select distinct
      produto_id

    from public.itens_reserva_estoque

    where reserva_id =
      v_reserva.id

  loop

    update public.produtos p

    set estoque = (
      select
        coalesce(
          sum(
            eu.quantidade
          ),
          0
        )

      from public.estoque_unidade eu

      join public.unidades u
        on u.id =
          eu.unidade_id

      where eu.produto_id =
        v_item.produto_id

        and u.ativo = true
    )

    where p.id =
      v_item.produto_id;

  end loop;


  return v_numero_pedido;

end;
$$;


-- =========================================================
-- SEGURANÇA
-- =========================================================

revoke all
on function public.converter_reserva_em_pedido(uuid)
from public;

revoke all
on function public.converter_reserva_em_pedido(uuid)
from anon;

revoke all
on function public.converter_reserva_em_pedido(uuid)
from authenticated;

grant execute
on function public.converter_reserva_em_pedido(uuid)
to service_role;