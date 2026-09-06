-- =========================================================
-- O BOX DRIVER
-- Criação transacional de reserva temporária de estoque
--
-- Esta função:
--
-- - NÃO cria pedido comercial
-- - NÃO baixa estoque físico
-- - NÃO aprova pagamento
--
-- Ela apenas reserva temporariamente o estoque
-- disponível para o usuário autenticado.
-- =========================================================


create or replace function public.criar_reserva_estoque(
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
  v_alocacao record;

  v_produto_id uuid;
  v_quantidade_solicitada bigint;
  v_quantidade_restante bigint;

  v_nome_produto text;
  v_codigo_produto text;

  v_estoque_fisico bigint;
  v_quantidade_reservada bigint;
  v_quantidade_disponivel bigint;
  v_quantidade_alocada bigint;
  v_estoque_rede_disponivel bigint;

  v_tempo_reserva integer;
  v_expira_em timestamptz;

  v_reserva_id uuid;

  v_alocacoes jsonb :=
    '[]'::jsonb;

  v_resultado_produtos jsonb :=
    '[]'::jsonb;

  v_distribuicao_produto jsonb;
begin

  -- =====================================================
  -- 1. USUÁRIO
  -- =====================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuário não autenticado';
  end if;


  -- =====================================================
  -- 2. CARRINHO
  -- =====================================================

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception
      'Carrinho vazio';
  end if;


  -- =====================================================
  -- 3. TEMPO DE RESERVA
  -- =====================================================

  select
    valor::integer
  into
    v_tempo_reserva
  from public.configuracoes_sistema
  where chave =
    'tempo_reserva_estoque_minutos';


  if v_tempo_reserva is null
     or v_tempo_reserva <= 0 then
    raise exception
      'Tempo de reserva de estoque não configurado';
  end if;


  v_expira_em :=
    now() +
    make_interval(
      mins => v_tempo_reserva
    );


  -- =====================================================
  -- 4. LIMPEZA LÓGICA DE RESERVAS VENCIDAS
  --
  -- Mesmo sem esta atualização, reservas vencidas já não
  -- entram no cálculo porque usamos expira_em > now().
  --
  -- Atualizamos o status apenas para manter o banco limpo
  -- e auditável.
  -- =====================================================

  update public.reservas_estoque
  set status = 'expirada'
  where status = 'ativa'
    and expira_em <= now();


  -- =====================================================
  -- 5. VALIDA FORMATO DOS ITENS
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


    if v_item.quantidade is null
       or v_item.quantidade <= 0 then
      raise exception
        'Quantidade inválida no carrinho';
    end if;

  end loop;


  -- =====================================================
  -- 6. LOCK DOS ESTOQUES
  --
  -- Este é um dos pontos mais importantes.
  --
  -- Se dois clientes tentarem reservar o último produto
  -- simultaneamente, ambos terão que passar pelo mesmo
  -- lock em estoque_unidade.
  --
  -- ORDER BY deixa a ordem determinística.
  -- =====================================================

  perform eu.id

  from public.estoque_unidade eu

  join public.unidades u
    on u.id = eu.unidade_id

  where eu.produto_id in (
    select distinct
      (item->>'produto_id')::uuid
    from jsonb_array_elements(p_itens) item
  )

    and u.ativo = true

  order by
    eu.produto_id,
    eu.unidade_id

  for update of eu;


  -- =====================================================
  -- 7. VALIDA DISPONIBILIDADE REAL DA REDE
  --
  -- disponível =
  -- estoque físico
  -- -
  -- reservas ativas e ainda não vencidas
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

    v_quantidade_solicitada :=
      v_item.quantidade;


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


    select
      coalesce(
        sum(
          greatest(
            eu.quantidade
            -
            coalesce(
              (
                select
                  sum(ire.quantidade)
                from public.itens_reserva_estoque ire
                join public.reservas_estoque re
                  on re.id = ire.reserva_id
                where ire.produto_id =
                      eu.produto_id

                  and ire.unidade_id =
                      eu.unidade_id

                  and re.status = 'ativa'
                  and re.expira_em > now()
              ),
              0
            ),
            0
          )
        ),
        0
      )::bigint

    into
      v_estoque_rede_disponivel

    from public.estoque_unidade eu

    join public.unidades u
      on u.id = eu.unidade_id

    where eu.produto_id =
          v_produto_id

      and u.ativo = true;


    if
      v_estoque_rede_disponivel
      <
      v_quantidade_solicitada
    then
      raise exception
        'Estoque disponível insuficiente para %. Disponível: %, solicitado: %',
        v_nome_produto,
        v_estoque_rede_disponivel,
        v_quantidade_solicitada;
    end if;

  end loop;


  -- =====================================================
  -- 8. CALCULA DISTRIBUIÇÃO DA RESERVA
  --
  -- Nesta primeira versão:
  --
  -- maior estoque disponível primeiro.
  --
  -- Isso mantém a mesma filosofia que já validamos na
  -- distribuição multiunidade.
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

    v_quantidade_solicitada :=
      v_item.quantidade;

    v_quantidade_restante :=
      v_quantidade_solicitada;

    v_distribuicao_produto :=
      '[]'::jsonb;


    select
      nome,
      codigo
    into
      v_nome_produto,
      v_codigo_produto
    from public.produtos
    where id = v_produto_id;


    for v_unidade in

      select
        u.id as unidade_id,
        u.codigo as unidade_codigo,
        u.nome as unidade_nome,
        u.cidade,
        u.estado,

        eu.quantidade
          as estoque_fisico,

        coalesce(
          (
            select
              sum(ire.quantidade)

            from public.itens_reserva_estoque ire

            join public.reservas_estoque re
              on re.id =
                 ire.reserva_id

            where ire.produto_id =
                  eu.produto_id

              and ire.unidade_id =
                  eu.unidade_id

              and re.status = 'ativa'

              and re.expira_em >
                  now()
          ),
          0
        )::bigint
          as reservado

      from public.estoque_unidade eu

      join public.unidades u
        on u.id = eu.unidade_id

      where eu.produto_id =
            v_produto_id

        and u.ativo = true

      order by
        (
          eu.quantidade
          -
          coalesce(
            (
              select
                sum(ire.quantidade)

              from public.itens_reserva_estoque ire

              join public.reservas_estoque re
                on re.id =
                   ire.reserva_id

              where ire.produto_id =
                    eu.produto_id

                and ire.unidade_id =
                    eu.unidade_id

                and re.status = 'ativa'

                and re.expira_em >
                    now()
            ),
            0
          )
        ) desc,

        u.codigo

    loop

      exit when
        v_quantidade_restante <= 0;


      v_estoque_fisico :=
        v_unidade.estoque_fisico;

      v_quantidade_reservada :=
        v_unidade.reservado;


      v_quantidade_disponivel :=
        greatest(
          v_estoque_fisico
          -
          v_quantidade_reservada,
          0
        );


      if
        v_quantidade_disponivel <= 0
      then
        continue;
      end if;


      v_quantidade_alocada :=
        least(
          v_quantidade_restante,
          v_quantidade_disponivel
        );


      if
        v_quantidade_alocada > 0
      then

        -- -----------------------------------------------
        -- Guarda internamente para inserir depois.
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
        -- Retorno amigável da distribuição.
        -- -----------------------------------------------

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

              'estoque_fisico',
                v_estoque_fisico,

              'ja_reservado',
                v_quantidade_reservada,

              'disponivel_antes_reserva',
                v_quantidade_disponivel,

              'quantidade_reservada',
                v_quantidade_alocada
            )
          );


        v_quantidade_restante :=
          v_quantidade_restante
          -
          v_quantidade_alocada;

      end if;

    end loop;


    if
      v_quantidade_restante > 0
    then
      raise exception
        'Não foi possível reservar completamente o produto %',
        v_nome_produto;
    end if;


    v_resultado_produtos :=
      v_resultado_produtos ||
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
  -- 9. CRIA CABEÇALHO DA RESERVA
  -- =====================================================

  insert into public.reservas_estoque (
    user_id,
    status,
    reservado_em,
    expira_em
  )
  values (
    v_user_id,
    'ativa',
    now(),
    v_expira_em
  )
  returning id
  into v_reserva_id;


  -- =====================================================
  -- 10. GRAVA ITENS DA RESERVA
  -- =====================================================

  for v_alocacao in

    select
      (a->>'produto_id')::uuid
        as produto_id,

      (a->>'unidade_id')::uuid
        as unidade_id,

      (a->>'quantidade')::bigint
        as quantidade

    from jsonb_array_elements(
      v_alocacoes
    ) a

  loop

    insert into
      public.itens_reserva_estoque (
        reserva_id,
        unidade_id,
        produto_id,
        quantidade
      )
    values (
      v_reserva_id,
      v_alocacao.unidade_id,
      v_alocacao.produto_id,
      v_alocacao.quantidade
    );

  end loop;


  -- =====================================================
  -- 11. RETORNO
  -- =====================================================

  return jsonb_build_object(
    'sucesso',
      true,

    'reserva_id',
      v_reserva_id,

    'status',
      'ativa',

    'tempo_reserva_minutos',
      v_tempo_reserva,

    'reservado_em',
      now(),

    'expira_em',
      v_expira_em,

    'produtos',
      v_resultado_produtos
  );

end;
$$;


-- =========================================================
-- PERMISSÕES
-- =========================================================

revoke all
on function public.criar_reserva_estoque(jsonb)
from public;

grant execute
on function public.criar_reserva_estoque(jsonb)
to authenticated;