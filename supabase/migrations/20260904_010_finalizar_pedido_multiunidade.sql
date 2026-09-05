-- =========================================================
-- O BOX DRIVER
-- Finalização transacional de pedido MULTIUNIDADE
--
-- IMPORTANTE:
-- Esta função é paralela à finalizar_pedido() atual.
-- Ainda NÃO substitui o checkout oficial.
--
-- Fluxo:
-- 1. valida carrinho
-- 2. trava estoques envolvidos
-- 3. calcula distribuição
-- 4. cria pedido comercial
-- 5. cria itens_pedido
-- 6. cria 1 retirada por unidade utilizada
-- 7. cria itens_retirada divididos por unidade
-- 8. baixa estoque de cada unidade
-- =========================================================


create or replace function public.finalizar_pedido_multiunidade(
  p_itens jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_item record;
  v_unidade record;
  v_alocacao record;

  v_produto_id uuid;
  v_quantidade bigint;
  v_quantidade_restante bigint;
  v_quantidade_alocada bigint;

  v_nome text;
  v_codigo text;
  v_preco numeric(12,2);

  v_estoque_rede bigint;

  v_total numeric(12,2) := 0;

  v_pedido_id uuid;
  v_numero_pedido bigint;

  v_item_pedido_id uuid;
  v_retirada_id uuid;
  v_ponto_retirada_id uuid;

  v_sequencia integer := 0;

  v_unidades_utilizadas uuid[] :=
    array[]::uuid[];

  v_alocacoes jsonb :=
    '[]'::jsonb;

  v_quantidade_unidades integer;

  v_unidade_unica_id uuid;
  v_ponto_unico_id uuid;
begin

  -- =====================================================
  -- 1. USUÁRIO
  -- =====================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- =====================================================
  -- 2. CARRINHO
  -- =====================================================

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio';
  end if;


  -- =====================================================
  -- 3. VALIDA FORMATO DOS ITENS
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid
        as produto_id,

      sum(
        (item->>'quantidade')::bigint
      )::bigint
        as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

  loop

    if v_item.produto_id is null then
      raise exception
        'Produto inválido no carrinho';
    end if;

    if v_item.quantidade <= 0 then
      raise exception
        'Quantidade inválida';
    end if;

  end loop;


  -- =====================================================
  -- 4. TRAVA TODOS OS ESTOQUES RELEVANTES
  --
  -- Antes de calcular a distribuição, travamos as linhas
  -- de estoque dos produtos solicitados.
  --
  -- ORDER BY deixa a ordem de locks previsível e reduz
  -- risco de deadlock em compras simultâneas.
  -- =====================================================

  perform eu.id

  from public.estoque_unidade eu

  join public.unidades u
    on u.id = eu.unidade_id

  where eu.produto_id in (
    select
      (item->>'produto_id')::uuid

    from jsonb_array_elements(p_itens) item
  )

    and u.ativo = true

  order by
    eu.produto_id,
    eu.unidade_id

  for update of eu;


  -- =====================================================
  -- 5. VALIDA ESTOQUE TOTAL E CALCULA TOTAL DO PEDIDO
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid
        as produto_id,

      sum(
        (item->>'quantidade')::bigint
      )::bigint
        as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

    order by
      (item->>'produto_id')::uuid

  loop

    v_produto_id :=
      v_item.produto_id;

    v_quantidade :=
      v_item.quantidade;


    select
      nome,
      codigo,
      preco

    into
      v_nome,
      v_codigo,
      v_preco

    from public.produtos

    where id = v_produto_id
      and ativo = true;


    if not found then
      raise exception
        'Produto não encontrado ou inativo';
    end if;


    select
      coalesce(
        sum(eu.quantidade),
        0
      )::bigint

    into
      v_estoque_rede

    from public.estoque_unidade eu

    join public.unidades u
      on u.id = eu.unidade_id

    where eu.produto_id = v_produto_id
      and u.ativo = true;


    if v_estoque_rede < v_quantidade then
      raise exception
        'Estoque insuficiente na rede para %. Disponível: %, solicitado: %',
        v_nome,
        v_estoque_rede,
        v_quantidade;
    end if;


    v_total :=
      v_total +
      (v_preco * v_quantidade);

  end loop;


  -- =====================================================
  -- 6. CALCULA DISTRIBUIÇÃO
  --
  -- Mesma regra da simulação:
  -- maior estoque primeiro.
  --
  -- Assim front, simulação e finalização usam o mesmo
  -- raciocínio nesta primeira versão.
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid
        as produto_id,

      sum(
        (item->>'quantidade')::bigint
      )::bigint
        as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

    order by
      (item->>'produto_id')::uuid

  loop

    v_produto_id :=
      v_item.produto_id;

    v_quantidade_restante :=
      v_item.quantidade;


    for v_unidade in

      select
        u.id as unidade_id,
        u.codigo,
        eu.quantidade as estoque

      from public.estoque_unidade eu

      join public.unidades u
        on u.id = eu.unidade_id

      where eu.produto_id =
            v_produto_id

        and u.ativo = true

        and eu.quantidade > 0

      order by
        eu.quantidade desc,
        u.codigo

    loop

      exit when
        v_quantidade_restante <= 0;


      v_quantidade_alocada :=
        least(
          v_quantidade_restante,
          v_unidade.estoque
        );


      if v_quantidade_alocada > 0 then

        -- -----------------------------------------------
        -- Guarda a alocação:
        --
        -- produto X
        -- unidade Y
        -- quantidade Z
        -- -----------------------------------------------

        v_alocacoes :=
          v_alocacoes ||
          jsonb_build_array(
            jsonb_build_object(
              'produto_id',
                v_produto_id,

              'unidade_id',
                v_unidade.unidade_id,

              'quantidade',
                v_quantidade_alocada
            )
          );


        -- -----------------------------------------------
        -- Guarda a unidade uma única vez.
        -- -----------------------------------------------

        if not (
          v_unidade.unidade_id =
          any(v_unidades_utilizadas)
        ) then

          v_unidades_utilizadas :=
            array_append(
              v_unidades_utilizadas,
              v_unidade.unidade_id
            );

        end if;


        v_quantidade_restante :=
          v_quantidade_restante -
          v_quantidade_alocada;

      end if;

    end loop;


    if v_quantidade_restante > 0 then
      raise exception
        'Não foi possível distribuir completamente o produto';
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
      'Nenhuma unidade foi selecionada para retirada';
  end if;


  -- =====================================================
  -- 7. COMPATIBILIDADE COM PEDIDO ANTIGO
  --
  -- Se houver somente UMA unidade:
  -- pedidos.unidade_id e ponto_retirada_id continuam
  -- preenchidos temporariamente.
  --
  -- Se houver mais de uma unidade:
  -- ficam NULL, pois logisticamente o pedido pertence
  -- a várias unidades.
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
  -- 8. CRIA PEDIDO COMERCIAL
  -- =====================================================

  insert into public.pedidos (
    user_id,
    unidade_id,
    ponto_retirada_id,
    status,
    total
  )
  values (
    v_user_id,
    v_unidade_unica_id,
    v_ponto_unico_id,

    -- legado temporário
    'recebido',

    v_total
  )
  returning
    id,
    numero_pedido

  into
    v_pedido_id,
    v_numero_pedido;


  -- =====================================================
  -- 9. CRIA ITENS COMERCIAIS
  --
  -- Um item_pedido representa a quantidade TOTAL comprada.
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid
        as produto_id,

      sum(
        (item->>'quantidade')::bigint
      )::bigint
        as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

    order by
      (item->>'produto_id')::uuid

  loop

    v_produto_id :=
      v_item.produto_id;

    v_quantidade :=
      v_item.quantidade;


    select
      nome,
      codigo,
      preco

    into
      v_nome,
      v_codigo,
      v_preco

    from public.produtos

    where id =
      v_produto_id;


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
      v_produto_id,
      v_nome,
      v_codigo,
      v_quantidade,
      v_preco,
      v_preco * v_quantidade
    );

  end loop;


  -- =====================================================
  -- 10. CRIA UMA RETIRADA PARA CADA UNIDADE UTILIZADA
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


    -- ---------------------------------------------------
    -- Ponto padrão da unidade
    -- ---------------------------------------------------

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


    -- ---------------------------------------------------
    -- Retirada
    --
    -- token_retirada é gerado automaticamente
    -- pela tabela.
    -- ---------------------------------------------------

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
    -- 11. ITENS DESTA RETIRADA
    -- ===================================================

    for v_alocacao in

      select
        (a->>'produto_id')::uuid
          as produto_id,

        (a->>'quantidade')::bigint
          as quantidade

      from jsonb_array_elements(
        v_alocacoes
      ) a

      where
        (a->>'unidade_id')::uuid =
        v_unidade.id

    loop

      select id

      into v_item_pedido_id

      from public.itens_pedido

      where pedido_id =
            v_pedido_id

        and produto_id =
            v_alocacao.produto_id

      limit 1;


      if v_item_pedido_id is null then
        raise exception
          'Item comercial do pedido não encontrado';
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
        v_alocacao.quantidade,
        0
      );


      -- =================================================
      -- 12. BAIXA ESTOQUE REAL DA UNIDADE
      -- =================================================

      update public.estoque_unidade

      set quantidade =
        quantidade -
        v_alocacao.quantidade

      where unidade_id =
            v_unidade.id

        and produto_id =
            v_alocacao.produto_id;


      if not found then
        raise exception
          'Estoque da unidade não encontrado';
      end if;

    end loop;

  end loop;


  -- =====================================================
  -- 13. COMPATIBILIDADE TEMPORÁRIA produtos.estoque
  --
  -- A partir da arquitetura multiunidade este campo
  -- passa a refletir o estoque TOTAL das unidades ativas.
  --
  -- Depois ele será removido do modelo operacional.
  -- =====================================================

  for v_item in

    select distinct
      (a->>'produto_id')::uuid
        as produto_id

    from jsonb_array_elements(
      v_alocacoes
    ) a

  loop

    update public.produtos p

    set estoque = (
      select
        coalesce(
          sum(eu.quantidade),
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


  -- =====================================================
  -- 14. RETORNO
  -- =====================================================

  return v_numero_pedido;

end;
$$;


-- =========================================================
-- PERMISSÕES
-- =========================================================

revoke all
on function public.finalizar_pedido_multiunidade(jsonb)
from public;


grant execute
on function public.finalizar_pedido_multiunidade(jsonb)
to authenticated;