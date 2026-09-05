-- =========================================================
-- O BOX DRIVER
-- Simulação de distribuição de estoque entre unidades
--
-- IMPORTANTE:
-- Esta função NÃO:
-- - cria pedido
-- - cria retirada
-- - baixa estoque
-- - reserva estoque
--
-- Ela apenas calcula uma sugestão de distribuição.
-- =========================================================


create or replace function public.simular_distribuicao_pedido(
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_item record;
  v_unidade record;

  v_produto_id uuid;
  v_quantidade_solicitada bigint;

  v_quantidade_restante bigint;
  v_quantidade_unidade bigint;
  v_quantidade_alocada bigint;

  v_nome_produto text;
  v_codigo_produto text;

  v_estoque_rede bigint;

  v_resultado jsonb := '[]'::jsonb;
  v_distribuicao_produto jsonb;
  v_produtos_resultado jsonb := '[]'::jsonb;

  v_total_unidades_utilizadas integer := 0;
  v_unidades_utilizadas uuid[] := array[]::uuid[];
begin

  -- =====================================================
  -- 1. USUÁRIO
  -- =====================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- =====================================================
  -- 2. VALIDA CARRINHO
  -- =====================================================

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio';
  end if;


  -- =====================================================
  -- 3. VALIDA TODOS OS PRODUTOS PRIMEIRO
  --
  -- Agrupamos produto_id para impedir que um mesmo
  -- produto apareça duplicado no JSON e distorça
  -- a disponibilidade.
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid as produto_id,
      sum(
        (item->>'quantidade')::bigint
      )::bigint as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

    order by
      (item->>'produto_id')::uuid

  loop

    v_produto_id :=
      v_item.produto_id;

    v_quantidade_solicitada :=
      v_item.quantidade;


    if v_produto_id is null then
      raise exception
        'Produto inválido no carrinho';
    end if;


    if v_quantidade_solicitada <= 0 then
      raise exception
        'Quantidade inválida';
    end if;


    -- ---------------------------------------------------
    -- Produto
    -- ---------------------------------------------------

    select
      nome,
      codigo

    into
      v_nome_produto,
      v_codigo_produto

    from public.produtos

    where id = v_produto_id
      and ativo = true;


    if not found then
      raise exception
        'Produto não encontrado ou inativo';
    end if;


    -- ---------------------------------------------------
    -- Estoque total da rede
    --
    -- Somente unidades ativas entram na conta.
    -- ---------------------------------------------------

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
      and u.ativo = true
      and eu.quantidade > 0;


    if v_estoque_rede < v_quantidade_solicitada then
      raise exception
        'Estoque insuficiente na rede para %. Disponível: %, solicitado: %',
        v_nome_produto,
        v_estoque_rede,
        v_quantidade_solicitada;
    end if;

  end loop;


  -- =====================================================
  -- 4. CALCULA DISTRIBUIÇÃO POR PRODUTO
  --
  -- Nesta primeira versão:
  --
  -- 1. priorizamos unidades com maior estoque;
  -- 2. isso tende a utilizar o menor número possível
  --    de pontos de retirada;
  -- 3. a lógica é determinística;
  -- 4. futuramente poderemos considerar distância,
  --    CEP, preferência e capacidade operacional.
  -- =====================================================

  for v_item in

    select
      (item->>'produto_id')::uuid as produto_id,
      sum(
        (item->>'quantidade')::bigint
      )::bigint as quantidade

    from jsonb_array_elements(p_itens) item

    group by
      (item->>'produto_id')::uuid

    order by
      (item->>'produto_id')::uuid

  loop

    v_produto_id :=
      v_item.produto_id;

    v_quantidade_solicitada :=
      v_item.quantidade;

    v_quantidade_restante :=
      v_quantidade_solicitada;


    select
      nome,
      codigo

    into
      v_nome_produto,
      v_codigo_produto

    from public.produtos

    where id = v_produto_id;


    v_distribuicao_produto :=
      '[]'::jsonb;


    -- ---------------------------------------------------
    -- Percorre unidades com estoque.
    --
    -- Maior saldo primeiro.
    -- Em empate, usamos código para resultado previsível.
    -- ---------------------------------------------------

    for v_unidade in

      select
        u.id as unidade_id,
        u.codigo as unidade_codigo,
        u.nome as unidade_nome,
        u.cidade,
        u.estado,
        eu.quantidade as estoque

      from public.estoque_unidade eu

      join public.unidades u
        on u.id = eu.unidade_id

      where eu.produto_id = v_produto_id
        and u.ativo = true
        and eu.quantidade > 0

      order by
        eu.quantidade desc,
        u.codigo

    loop

      exit when
        v_quantidade_restante <= 0;


      v_quantidade_unidade :=
        v_unidade.estoque;


      v_quantidade_alocada :=
        least(
          v_quantidade_restante,
          v_quantidade_unidade
        );


      if v_quantidade_alocada > 0 then

        v_distribuicao_produto :=
          v_distribuicao_produto ||
          jsonb_build_array(
            jsonb_build_object(
              'unidade_id',
                v_unidade.unidade_id,

              'unidade_codigo',
                v_unidade.unidade_codigo,

              'unidade_nome',
                v_unidade.unidade_nome,

              'cidade',
                v_unidade.cidade,

              'estado',
                v_unidade.estado,

              'estoque_disponivel',
                v_quantidade_unidade,

              'quantidade_alocada',
                v_quantidade_alocada
            )
          );


        -- -----------------------------------------------
        -- Guarda unidade usada no conjunto geral
        -- sem duplicar.
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


    -- ---------------------------------------------------
    -- Segurança adicional
    -- ---------------------------------------------------

    if v_quantidade_restante > 0 then
      raise exception
        'Não foi possível distribuir completamente o produto %',
        v_nome_produto;
    end if;


    -- ---------------------------------------------------
    -- Resultado do produto
    -- ---------------------------------------------------

    v_produtos_resultado :=
      v_produtos_resultado ||
      jsonb_build_array(
        jsonb_build_object(
          'produto_id',
            v_produto_id,

          'codigo',
            v_codigo_produto,

          'produto',
            v_nome_produto,

          'quantidade_solicitada',
            v_quantidade_solicitada,

          'distribuicao',
            v_distribuicao_produto
        )
      );

  end loop;


  -- =====================================================
  -- 5. TOTAL DE UNIDADES UTILIZADAS
  -- =====================================================

  v_total_unidades_utilizadas :=
    coalesce(
      array_length(
        v_unidades_utilizadas,
        1
      ),
      0
    );


  -- =====================================================
  -- 6. RETORNO
  -- =====================================================

  v_resultado :=
    jsonb_build_object(
      'sucesso',
        true,

      'quantidade_unidades_retirada',
        v_total_unidades_utilizadas,

      'retirada_unica',
        v_total_unidades_utilizadas = 1,

      'produtos',
        v_produtos_resultado
    );


  return v_resultado;

end;
$$;


-- =========================================================
-- PERMISSÕES
-- =========================================================

revoke all
on function public.simular_distribuicao_pedido(jsonb)
from public;


grant execute
on function public.simular_distribuicao_pedido(jsonb)
to authenticated;