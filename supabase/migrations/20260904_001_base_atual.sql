--
-- PostgreSQL database dump
--

\restrict cJ7ebsalHMlrnZrS8szDdp1XhPHXdKCgsH5EqtcXaErlXNvM8XwL6IlVXmNfC1y

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: confirmar_entrega(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmar_entrega(p_numero_pedido bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_pedido_id uuid;
  v_status text;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception 'Usuário sem permissão para confirmar entrega';
  end if;

  select
    id,
    status
  into
    v_pedido_id,
    v_status
  from public.pedidos
  where numero_pedido = p_numero_pedido
  for update;

  if not found then
    raise exception 'Pedido nº % não encontrado', p_numero_pedido;
  end if;

  if v_status = 'entregue' then
    raise exception 'Pedido nº % já foi entregue', p_numero_pedido;
  end if;

  if v_status <> 'cliente_no_local' then
    raise exception
      'Pedido nº % não pode ser entregue. Status atual: %',
      p_numero_pedido,
      v_status;
  end if;

  update public.pedidos
  set
    status = 'entregue',
    entregue_em = now(),
    entregue_por = v_user_id
  where id = v_pedido_id;

  insert into public.historico_pedido (
    pedido_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    v_user_id,
    'entrega_confirmada',
    'cliente_no_local',
    'entregue',
    'Entrega física confirmada pelo colaborador'
  );

  return jsonb_build_object(
    'sucesso', true,
    'pedido', p_numero_pedido,
    'status', 'entregue'
  );

end;
$$;


--
-- Name: finalizar_pedido(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalizar_pedido(p_itens jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;

  v_unidade_id uuid;
  v_ponto_retirada_id uuid;

  v_pedido_id uuid;
  v_numero_pedido bigint;
  v_token_retirada uuid;

  v_retirada_id uuid;
  v_item_pedido_id uuid;

  v_produto_id uuid;
  v_quantidade bigint;

  v_preco numeric(12,2);
  v_nome text;
  v_codigo text;

  v_estoque_unidade bigint;

  v_total numeric(12,2) := 0;
begin

  -- =====================================================
  -- USUÁRIO
  -- =====================================================

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- =====================================================
  -- CARRINHO
  -- =====================================================

  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio';
  end if;


  -- =====================================================
  -- UNIDADE
  --
  -- Nesta primeira fase temos somente MOGI-01.
  --
  -- Futuramente a distribuição poderá utilizar
  -- várias unidades dentro do mesmo pedido.
  -- =====================================================

  select id
  into v_unidade_id
  from public.unidades
  where codigo = 'MOGI-01'
    and ativo = true
  limit 1;

  if v_unidade_id is null then
    raise exception
      'Unidade MOGI-01 não encontrada ou inativa';
  end if;


  -- =====================================================
  -- PONTO DE RETIRADA
  -- =====================================================

  select id
  into v_ponto_retirada_id
  from public.pontos_retirada
  where unidade_id = v_unidade_id
    and ativo = true
  order by created_at
  limit 1;

  if v_ponto_retirada_id is null then
    raise exception
      'A unidade MOGI-01 não possui ponto de retirada ativo';
  end if;


  -- =====================================================
  -- VALIDA E TRAVA ESTOQUE
  -- =====================================================

  for v_produto_id, v_quantidade in

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

    if v_produto_id is null then
      raise exception
        'Produto inválido no carrinho';
    end if;

    if v_quantidade <= 0 then
      raise exception
        'Quantidade inválida';
    end if;


    select
      p.nome,
      p.codigo,
      p.preco,
      eu.quantidade

    into
      v_nome,
      v_codigo,
      v_preco,
      v_estoque_unidade

    from public.produtos p

    join public.estoque_unidade eu
      on eu.produto_id = p.id
     and eu.unidade_id = v_unidade_id

    where p.id = v_produto_id
      and p.ativo = true

    for update of eu;


    if not found then
      raise exception
        'Produto não encontrado, inativo ou sem estoque cadastrado na unidade';
    end if;


    if v_estoque_unidade < v_quantidade then
      raise exception
        'Estoque insuficiente para %. Disponível: %, solicitado: %',
        v_nome,
        v_estoque_unidade,
        v_quantidade;
    end if;


    v_total :=
      v_total +
      (v_preco * v_quantidade);

  end loop;


  -- =====================================================
  -- CRIA PEDIDO
  --
  -- unidade_id e ponto_retirada_id permanecem
  -- temporariamente por compatibilidade.
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
    v_unidade_id,
    v_ponto_retirada_id,
    'recebido',
    v_total
  )
  returning
    id,
    numero_pedido,
    token_retirada
  into
    v_pedido_id,
    v_numero_pedido,
    v_token_retirada;


  -- =====================================================
  -- CRIA RETIRADA 1
  --
  -- Hoje todo pedido gera uma única retirada em MOGI-01.
  --
  -- O mesmo token do pedido é utilizado nesta fase
  -- para manter compatibilidade com QR e Totem atuais.
  -- =====================================================

  insert into public.retiradas_pedido (
    pedido_id,
    sequencia,
    unidade_id,
    ponto_retirada_id,
    status,
    token_retirada
  )
  values (
    v_pedido_id,
    1,
    v_unidade_id,
    v_ponto_retirada_id,
    'recebido',
    v_token_retirada
  )
  returning id
  into v_retirada_id;


  -- =====================================================
  -- ITENS DO PEDIDO + ITENS DA RETIRADA + ESTOQUE
  -- =====================================================

  for v_produto_id, v_quantidade in

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
        'Produto não encontrado durante a gravação do pedido';
    end if;


    -- ---------------------------------------------------
    -- ITEM COMERCIAL DO PEDIDO
    -- ---------------------------------------------------

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
    )
    returning id
    into v_item_pedido_id;


    -- ---------------------------------------------------
    -- ITEM LOGÍSTICO DA RETIRADA
    -- ---------------------------------------------------

    insert into public.itens_retirada (
      retirada_id,
      item_pedido_id,
      quantidade,
      quantidade_separada
    )
    values (
      v_retirada_id,
      v_item_pedido_id,
      v_quantidade,
      0
    );


    -- ---------------------------------------------------
    -- BAIXA DO ESTOQUE DA UNIDADE
    -- ---------------------------------------------------

    update public.estoque_unidade
    set quantidade =
      quantidade - v_quantidade
    where unidade_id = v_unidade_id
      and produto_id = v_produto_id;


    -- ---------------------------------------------------
    -- COMPATIBILIDADE TEMPORÁRIA
    --
    -- produtos.estoque continuará espelhando MOGI-01
    -- enquanto terminamos de migrar todas as telas.
    -- ---------------------------------------------------

    update public.produtos p
    set estoque = eu.quantidade
    from public.estoque_unidade eu
    where p.id = v_produto_id
      and eu.produto_id = p.id
      and eu.unidade_id = v_unidade_id;

  end loop;


  return v_numero_pedido;

end;
$$;


--
-- Name: iniciar_separacao(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iniciar_separacao(p_numero_pedido bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_pedido_id uuid;
  v_status_atual text;
  v_status_pagamento text;
begin

  -- Usuário autenticado
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- Verifica se é administrador
  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception 'Usuário sem permissão para iniciar separação';
  end if;


  -- Busca e trava o pedido
  select
    id,
    status,
    status_pagamento
  into
    v_pedido_id,
    v_status_atual,
    v_status_pagamento
  from public.pedidos
  where numero_pedido = p_numero_pedido
  for update;


  if not found then
    raise exception 'Pedido não encontrado';
  end if;


  -- Só permite separar pedido pago
  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido não pode ser separado. Pagamento atual: %',
      v_status_pagamento;
  end if;


  -- Impede iniciar separação novamente
  if v_status_atual = 'em separação' then
    raise exception 'Separação deste pedido já foi iniciada';
  end if;


  if v_status_atual in (
    'pronto',
    'cliente no local',
    'entregue',
    'retirado'
  ) then
    raise exception
      'Pedido não pode iniciar separação no status atual: %',
      v_status_atual;
  end if;


  -- Atualiza pedido
  update public.pedidos
  set
    status = 'em separação',
    separacao_iniciada_em = now(),
    separacao_iniciada_por = v_user_id
  where id = v_pedido_id;


  -- Registra histórico
  insert into public.historico_pedido (
    pedido_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    v_user_id,
    'separacao_iniciada',
    v_status_atual,
    'em separação',
    'Separação iniciada pelo painel operacional'
  );

end;
$$;


--
-- Name: registrar_checkin_retirada(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_checkin_retirada(p_token_retirada uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_pedido_id uuid;
  v_numero_pedido bigint;
  v_status text;
  v_status_pagamento text;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- Somente equipe interna
  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception
      'Usuário sem permissão para registrar check-in';
  end if;

  -- Busca e trava o pedido
  select
    id,
    numero_pedido,
    status,
    status_pagamento
  into
    v_pedido_id,
    v_numero_pedido,
    v_status,
    v_status_pagamento
  from public.pedidos
  where token_retirada = p_token_retirada
  for update;

  if not found then
    raise exception 'QR Code inválido';
  end if;

  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido nº % ainda não possui pagamento aprovado',
      v_numero_pedido;
  end if;

  if v_status = 'entregue' then
    raise exception
      'Pedido nº % já foi entregue',
      v_numero_pedido;
  end if;

  if v_status = 'cliente_no_local' then
    raise exception
      'Check-in do Pedido nº % já foi realizado',
      v_numero_pedido;
  end if;

  if v_status <> 'pronto_retirada' then
    raise exception
      'Pedido nº % não está liberado para retirada. Status atual: %',
      v_numero_pedido,
      v_status;
  end if;

  update public.pedidos
  set
    status = 'cliente_no_local',
    checkin_em = now()
  where id = v_pedido_id;

  insert into public.historico_pedido (
    pedido_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    v_user_id,
    'checkin_retirada',
    'pronto_retirada',
    'cliente_no_local',
    'Check-in realizado através do QR Code do pedido'
  );

  return jsonb_build_object(
    'sucesso', true,
    'pedido', v_numero_pedido,
    'status', 'cliente_no_local'
  );

end;
$$;


--
-- Name: registrar_checkin_retirada(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_checkin_retirada(p_token_retirada uuid, p_terminal_identificador text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_pedido_id uuid;
  v_numero_pedido bigint;
  v_status text;
  v_status_pagamento text;

  v_ponto_retirada_id uuid;
  v_ponto_nome text;
  v_instrucao_cliente text;

  v_terminal_id uuid;
  v_terminal_nome text;
begin

  -- =====================================================
  -- VALIDA TERMINAL
  -- =====================================================

  select
    id,
    nome
  into
    v_terminal_id,
    v_terminal_nome
  from public.terminais_checkin
  where identificador = trim(p_terminal_identificador)
    and ativo = true;

  if not found then
    raise exception 'Terminal de check-in inválido ou inativo';
  end if;


  -- =====================================================
  -- BUSCA E TRAVA PEDIDO
  -- =====================================================

  select
    p.id,
    p.numero_pedido,
    p.status,
    p.status_pagamento,
    p.ponto_retirada_id
  into
    v_pedido_id,
    v_numero_pedido,
    v_status,
    v_status_pagamento,
    v_ponto_retirada_id
  from public.pedidos p
  where p.token_retirada = p_token_retirada
  for update;

  if not found then
    raise exception 'QR Code inválido';
  end if;


  -- =====================================================
  -- VALIDA PAGAMENTO
  -- =====================================================

  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido nº % ainda não possui pagamento aprovado',
      v_numero_pedido;
  end if;


  -- =====================================================
  -- VALIDA STATUS
  -- =====================================================

  if v_status = 'entregue' then
    raise exception
      'Pedido nº % já foi entregue',
      v_numero_pedido;
  end if;

  if v_status = 'cliente_no_local' then
    raise exception
      'Check-in do Pedido nº % já foi realizado',
      v_numero_pedido;
  end if;

  if v_status <> 'pronto_retirada' then
    raise exception
      'Pedido nº % não está liberado para retirada. Status atual: %',
      v_numero_pedido,
      v_status;
  end if;


  -- =====================================================
  -- VALIDA PONTO DE RETIRADA
  -- =====================================================

  if v_ponto_retirada_id is null then
    raise exception
      'Pedido nº % não possui ponto de retirada definido',
      v_numero_pedido;
  end if;

  select
    nome,
    instrucao_cliente
  into
    v_ponto_nome,
    v_instrucao_cliente
  from public.pontos_retirada
  where id = v_ponto_retirada_id
    and ativo = true;

  if not found then
    raise exception
      'Ponto de retirada não encontrado ou inativo';
  end if;


  -- =====================================================
  -- REGISTRA CHECK-IN
  -- =====================================================

  update public.pedidos
  set
    status = 'cliente_no_local',
    checkin_em = now(),
    terminal_checkin_id = v_terminal_id
  where id = v_pedido_id;


  -- =====================================================
  -- HISTÓRICO
  -- =====================================================

  insert into public.historico_pedido (
    pedido_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    null,
    'checkin_retirada',
    'pronto_retirada',
    'cliente_no_local',
    'Check-in realizado no terminal ' || v_terminal_nome
  );


  -- =====================================================
  -- RETORNO PARA O TOTEM
  -- =====================================================

  return jsonb_build_object(
    'sucesso', true,
    'pedido', v_numero_pedido,
    'status', 'cliente_no_local',
    'terminal', v_terminal_nome,
    'ponto_retirada', v_ponto_nome,
    'instrucao_cliente', v_instrucao_cliente
  );

end;
$$;


--
-- Name: registrar_checkin_totem(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_checkin_totem(p_token_retirada uuid, p_terminal_identificador text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_pedido_id uuid;
  v_numero_pedido bigint;
  v_status text;
  v_status_pagamento text;

  v_ponto_retirada_id uuid;
  v_ponto_nome text;
  v_instrucao_cliente text;

  v_terminal_id uuid;
  v_terminal_nome text;
begin

  -- ===============================================
  -- VALIDA TERMINAL
  -- ===============================================

  select
    id,
    nome
  into
    v_terminal_id,
    v_terminal_nome
  from public.terminais_checkin
  where identificador = trim(p_terminal_identificador)
    and ativo = true;

  if not found then
    raise exception 'Terminal de check-in inválido ou inativo';
  end if;


  -- ===============================================
  -- BUSCA E TRAVA PEDIDO
  -- ===============================================

  select
    p.id,
    p.numero_pedido,
    p.status,
    p.status_pagamento,
    p.ponto_retirada_id
  into
    v_pedido_id,
    v_numero_pedido,
    v_status,
    v_status_pagamento,
    v_ponto_retirada_id
  from public.pedidos p
  where p.token_retirada = p_token_retirada
  for update;

  if not found then
    raise exception 'QR Code inválido';
  end if;


  -- ===============================================
  -- PAGAMENTO
  -- ===============================================

  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido nº % ainda não possui pagamento aprovado',
      v_numero_pedido;
  end if;


  -- ===============================================
  -- STATUS
  -- ===============================================

  if v_status = 'entregue' then
    raise exception
      'Pedido nº % já foi entregue',
      v_numero_pedido;
  end if;

  if v_status = 'cliente_no_local' then
    raise exception
      'Check-in do Pedido nº % já foi realizado',
      v_numero_pedido;
  end if;

  if v_status <> 'pronto_retirada' then
    raise exception
      'Pedido nº % não está liberado para retirada. Status atual: %',
      v_numero_pedido,
      v_status;
  end if;


  -- ===============================================
  -- PONTO DE RETIRADA
  -- ===============================================

  if v_ponto_retirada_id is null then
    raise exception
      'Pedido nº % não possui ponto de retirada definido',
      v_numero_pedido;
  end if;

  select
    nome,
    instrucao_cliente
  into
    v_ponto_nome,
    v_instrucao_cliente
  from public.pontos_retirada
  where id = v_ponto_retirada_id
    and ativo = true;

  if not found then
    raise exception
      'Ponto de retirada não encontrado ou inativo';
  end if;


  -- ===============================================
  -- CHECK-IN
  -- ===============================================

  update public.pedidos
  set
    status = 'cliente_no_local',
    checkin_em = now(),
    terminal_checkin_id = v_terminal_id
  where id = v_pedido_id;


  -- ===============================================
  -- HISTÓRICO
  -- ===============================================

  insert into public.historico_pedido (
    pedido_id,
    user_id,
    evento,
    status_anterior,
    status_novo,
    observacao
  )
  values (
    v_pedido_id,
    null,
    'checkin_totem',
    'pronto_retirada',
    'cliente_no_local',
    'Check-in realizado no terminal ' || v_terminal_nome
  );


  -- ===============================================
  -- RETORNO PARA O TOTEM
  -- ===============================================

  return jsonb_build_object(
    'sucesso', true,
    'pedido', v_numero_pedido,
    'status', 'cliente_no_local',
    'terminal', v_terminal_nome,
    'ponto_retirada', v_ponto_nome,
    'instrucao_cliente', v_instrucao_cliente
  );

end;
$$;


--
-- Name: registrar_leitura_separacao(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_leitura_separacao(p_numero_pedido bigint, p_codigo_lido text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_pedido_id uuid;
  v_status_pedido text;

  v_item_id uuid;
  v_nome_produto text;
  v_quantidade bigint;
  v_quantidade_separada bigint;

  v_item_concluido boolean;
  v_pedido_concluido boolean;
  v_separacao_finalizada boolean := false;
begin

  -- Usuário autenticado
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- Somente admin
  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception
      'Usuário sem permissão para registrar separação';
  end if;

  -- Código obrigatório
  if p_codigo_lido is null
     or trim(p_codigo_lido) = '' then
    raise exception 'Código do produto não informado';
  end if;

  -- Busca e trava pedido
  select
    id,
    status
  into
    v_pedido_id,
    v_status_pedido
  from public.pedidos
  where numero_pedido = p_numero_pedido
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  -- Pedido precisa estar em separação
  if v_status_pedido <> 'em separação' then
    raise exception
      'Pedido não está em separação. Status atual: %',
      v_status_pedido;
  end if;

  -- Localiza item pelo código
  select
    id,
    nome_produto,
    quantidade,
    quantidade_separada
  into
    v_item_id,
    v_nome_produto,
    v_quantidade,
    v_quantidade_separada
  from public.itens_pedido
  where pedido_id = v_pedido_id
    and codigo_produto = trim(p_codigo_lido)
  limit 1
  for update;

  if not found then
    raise exception
      'Produto % não pertence ao Pedido nº %',
      trim(p_codigo_lido),
      p_numero_pedido;
  end if;

  -- Impede excesso
  if v_quantidade_separada >= v_quantidade then
    raise exception
      'Quantidade de % já foi totalmente separada',
      v_nome_produto;
  end if;

  -- Soma uma unidade separada
  update public.itens_pedido
  set quantidade_separada = quantidade_separada + 1
  where id = v_item_id
  returning quantidade_separada
  into v_quantidade_separada;

  -- Registra a leitura
  insert into public.leituras_separacao (
    pedido_id,
    item_pedido_id,
    user_id,
    codigo_lido
  )
  values (
    v_pedido_id,
    v_item_id,
    v_user_id,
    trim(p_codigo_lido)
  );

  -- Item concluído?
  v_item_concluido :=
    v_quantidade_separada >= v_quantidade;

  -- Pedido inteiro concluído?
  select not exists (
    select 1
    from public.itens_pedido
    where pedido_id = v_pedido_id
      and quantidade_separada < quantidade
  )
  into v_pedido_concluido;

  -- Se foi a última leitura necessária,
  -- finaliza separação automaticamente
  if v_pedido_concluido then

    update public.pedidos
    set
      status = 'pronto_retirada',
      separacao_finalizada_em = now(),
      separacao_finalizada_por = v_user_id
    where id = v_pedido_id;

    insert into public.historico_pedido (
      pedido_id,
      user_id,
      evento,
      status_anterior,
      status_novo,
      observacao
    )
    values (
      v_pedido_id,
      v_user_id,
      'separacao_finalizada',
      'em separação',
      'pronto_retirada',
      'Separação finalizada automaticamente após leitura de todos os itens'
    );

    v_separacao_finalizada := true;

  end if;

  return jsonb_build_object(
    'pedido', p_numero_pedido,
    'codigo', trim(p_codigo_lido),
    'produto', v_nome_produto,
    'quantidade_pedida', v_quantidade,
    'quantidade_separada', v_quantidade_separada,
    'item_concluido', v_item_concluido,
    'pedido_concluido', v_pedido_concluido,
    'separacao_finalizada', v_separacao_finalizada
  );

end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: estoque_unidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estoque_unidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unidade_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    quantidade bigint DEFAULT 0 NOT NULL,
    CONSTRAINT estoque_unidade_quantidade_check CHECK ((quantidade >= 0))
);


--
-- Name: franqueados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franqueados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'franqueada'::text NOT NULL,
    razao_social text,
    nome_fantasia text,
    cnpj text,
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT franqueados_tipo_check CHECK ((tipo = ANY (ARRAY['propria'::text, 'franqueada'::text])))
);


--
-- Name: historico_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid NOT NULL,
    user_id uuid,
    evento text NOT NULL,
    status_anterior text,
    status_novo text,
    observacao text
);


--
-- Name: itens_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itens_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    nome_produto text NOT NULL,
    codigo_produto text NOT NULL,
    quantidade bigint NOT NULL,
    preco_unitario numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    quantidade_separada bigint DEFAULT 0 NOT NULL
);


--
-- Name: itens_retirada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.itens_retirada (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retirada_id uuid NOT NULL,
    item_pedido_id uuid NOT NULL,
    quantidade bigint NOT NULL,
    quantidade_separada bigint DEFAULT 0 NOT NULL,
    CONSTRAINT itens_retirada_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT itens_retirada_quantidade_separada_check CHECK (((quantidade_separada >= 0) AND (quantidade_separada <= quantidade)))
);


--
-- Name: leituras_separacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leituras_separacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid NOT NULL,
    item_pedido_id uuid NOT NULL,
    user_id uuid NOT NULL,
    codigo_lido text NOT NULL
);


--
-- Name: pedidos_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'recebido'::text NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    numero_pedido bigint DEFAULT nextval('public.pedidos_numero_seq'::regclass) NOT NULL,
    status_pagamento text DEFAULT 'pendente'::text NOT NULL,
    separacao_iniciada_em timestamp with time zone,
    separacao_iniciada_por uuid,
    separacao_finalizada_em timestamp with time zone,
    separacao_finalizada_por uuid,
    checkin_em timestamp with time zone,
    entregue_em timestamp with time zone,
    entregue_por uuid,
    token_retirada uuid DEFAULT gen_random_uuid() NOT NULL,
    ponto_retirada_id uuid,
    terminal_checkin_id uuid,
    unidade_id uuid
);


--
-- Name: perfil_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfil_cliente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    nome text,
    telefone text,
    tipo_usuario text DEFAULT 'cliente'::text NOT NULL
);


--
-- Name: pontos_retirada; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pontos_retirada (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nome text NOT NULL,
    descricao text,
    instrucao_cliente text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    unidade_id uuid
);


--
-- Name: produto_teste; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto_teste (
    id bigint NOT NULL,
    nome text NOT NULL,
    preco numeric,
    ativo boolean DEFAULT true
);


--
-- Name: produto_teste_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.produto_teste ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.produto_teste_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nome text NOT NULL,
    descricao text,
    preco numeric(12,2) DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    categoria text,
    codigo text,
    imagem_url text,
    estoque bigint DEFAULT 0 NOT NULL
);


--
-- Name: retiradas_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retiradas_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid NOT NULL,
    sequencia integer NOT NULL,
    unidade_id uuid NOT NULL,
    ponto_retirada_id uuid,
    status text DEFAULT 'recebido'::text NOT NULL,
    token_retirada uuid DEFAULT gen_random_uuid() NOT NULL,
    separacao_iniciada_em timestamp with time zone,
    separacao_iniciada_por uuid,
    separacao_finalizada_em timestamp with time zone,
    separacao_finalizada_por uuid,
    checkin_em timestamp with time zone,
    terminal_checkin_id uuid,
    entregue_em timestamp with time zone,
    entregue_por uuid
);


--
-- Name: terminais_checkin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terminais_checkin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nome text NOT NULL,
    identificador text NOT NULL,
    localizacao text,
    ativo boolean DEFAULT true NOT NULL,
    unidade_id uuid
);


--
-- Name: unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nome text NOT NULL,
    codigo text NOT NULL,
    endereco text,
    cidade text,
    estado text,
    ativo boolean DEFAULT true NOT NULL,
    franqueado_id uuid
);


--
-- Name: estoque_unidade estoque_unidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_unidade
    ADD CONSTRAINT estoque_unidade_pkey PRIMARY KEY (id);


--
-- Name: estoque_unidade estoque_unidade_unidade_produto_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_unidade
    ADD CONSTRAINT estoque_unidade_unidade_produto_key UNIQUE (unidade_id, produto_id);


--
-- Name: franqueados franqueados_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franqueados
    ADD CONSTRAINT franqueados_codigo_key UNIQUE (codigo);


--
-- Name: franqueados franqueados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franqueados
    ADD CONSTRAINT franqueados_pkey PRIMARY KEY (id);


--
-- Name: historico_pedido historico_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_pedido
    ADD CONSTRAINT historico_pedido_pkey PRIMARY KEY (id);


--
-- Name: itens_pedido itens_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT itens_pedido_pkey PRIMARY KEY (id);


--
-- Name: itens_retirada itens_retirada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_retirada
    ADD CONSTRAINT itens_retirada_pkey PRIMARY KEY (id);


--
-- Name: itens_retirada itens_retirada_retirada_item_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_retirada
    ADD CONSTRAINT itens_retirada_retirada_item_key UNIQUE (retirada_id, item_pedido_id);


--
-- Name: leituras_separacao leituras_separacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_separacao
    ADD CONSTRAINT leituras_separacao_pkey PRIMARY KEY (id);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: perfil_cliente perfil_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfil_cliente
    ADD CONSTRAINT perfil_cliente_pkey PRIMARY KEY (id);


--
-- Name: pontos_retirada pontos_retirada_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos_retirada
    ADD CONSTRAINT pontos_retirada_pkey PRIMARY KEY (id);


--
-- Name: produto_teste produto_teste_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto_teste
    ADD CONSTRAINT produto_teste_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: retiradas_pedido retiradas_pedido_pedido_sequencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_pedido_sequencia_key UNIQUE (pedido_id, sequencia);


--
-- Name: retiradas_pedido retiradas_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_pkey PRIMARY KEY (id);


--
-- Name: retiradas_pedido retiradas_pedido_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_token_key UNIQUE (token_retirada);


--
-- Name: terminais_checkin terminais_checkin_identificador_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminais_checkin
    ADD CONSTRAINT terminais_checkin_identificador_key UNIQUE (identificador);


--
-- Name: terminais_checkin terminais_checkin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminais_checkin
    ADD CONSTRAINT terminais_checkin_pkey PRIMARY KEY (id);


--
-- Name: unidades unidades_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_codigo_key UNIQUE (codigo);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id);


--
-- Name: pedidos_numero_pedido_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedidos_numero_pedido_key ON public.pedidos USING btree (numero_pedido);


--
-- Name: pedidos_token_retirada_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedidos_token_retirada_key ON public.pedidos USING btree (token_retirada);


--
-- Name: estoque_unidade estoque_unidade_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_unidade
    ADD CONSTRAINT estoque_unidade_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: estoque_unidade estoque_unidade_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_unidade
    ADD CONSTRAINT estoque_unidade_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id) ON DELETE CASCADE;


--
-- Name: historico_pedido historico_pedido_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_pedido
    ADD CONSTRAINT historico_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: historico_pedido historico_pedido_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_pedido
    ADD CONSTRAINT historico_pedido_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: itens_pedido itens_pedido_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT itens_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: itens_pedido itens_pedido_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_pedido
    ADD CONSTRAINT itens_pedido_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);


--
-- Name: itens_retirada itens_retirada_item_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_retirada
    ADD CONSTRAINT itens_retirada_item_pedido_id_fkey FOREIGN KEY (item_pedido_id) REFERENCES public.itens_pedido(id) ON DELETE CASCADE;


--
-- Name: itens_retirada itens_retirada_retirada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.itens_retirada
    ADD CONSTRAINT itens_retirada_retirada_id_fkey FOREIGN KEY (retirada_id) REFERENCES public.retiradas_pedido(id) ON DELETE CASCADE;


--
-- Name: leituras_separacao leituras_separacao_item_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_separacao
    ADD CONSTRAINT leituras_separacao_item_pedido_id_fkey FOREIGN KEY (item_pedido_id) REFERENCES public.itens_pedido(id) ON DELETE CASCADE;


--
-- Name: leituras_separacao leituras_separacao_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_separacao
    ADD CONSTRAINT leituras_separacao_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: leituras_separacao leituras_separacao_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_separacao
    ADD CONSTRAINT leituras_separacao_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_entregue_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_entregue_por_fkey FOREIGN KEY (entregue_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_ponto_retirada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_ponto_retirada_id_fkey FOREIGN KEY (ponto_retirada_id) REFERENCES public.pontos_retirada(id);


--
-- Name: pedidos pedidos_separacao_finalizada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_separacao_finalizada_por_fkey FOREIGN KEY (separacao_finalizada_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_separacao_iniciada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_separacao_iniciada_por_fkey FOREIGN KEY (separacao_iniciada_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_terminal_checkin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_terminal_checkin_id_fkey FOREIGN KEY (terminal_checkin_id) REFERENCES public.terminais_checkin(id);


--
-- Name: pedidos pedidos_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);


--
-- Name: pedidos pedidos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perfil_cliente perfil_cliente_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfil_cliente
    ADD CONSTRAINT perfil_cliente_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pontos_retirada pontos_retirada_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos_retirada
    ADD CONSTRAINT pontos_retirada_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);


--
-- Name: retiradas_pedido retiradas_pedido_entregue_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_entregue_por_fkey FOREIGN KEY (entregue_por) REFERENCES auth.users(id);


--
-- Name: retiradas_pedido retiradas_pedido_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: retiradas_pedido retiradas_pedido_ponto_retirada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_ponto_retirada_id_fkey FOREIGN KEY (ponto_retirada_id) REFERENCES public.pontos_retirada(id);


--
-- Name: retiradas_pedido retiradas_pedido_separacao_finalizada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_separacao_finalizada_por_fkey FOREIGN KEY (separacao_finalizada_por) REFERENCES auth.users(id);


--
-- Name: retiradas_pedido retiradas_pedido_separacao_iniciada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_separacao_iniciada_por_fkey FOREIGN KEY (separacao_iniciada_por) REFERENCES auth.users(id);


--
-- Name: retiradas_pedido retiradas_pedido_terminal_checkin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_terminal_checkin_id_fkey FOREIGN KEY (terminal_checkin_id) REFERENCES public.terminais_checkin(id);


--
-- Name: retiradas_pedido retiradas_pedido_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiradas_pedido
    ADD CONSTRAINT retiradas_pedido_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);


--
-- Name: terminais_checkin terminais_checkin_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminais_checkin
    ADD CONSTRAINT terminais_checkin_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);


--
-- Name: unidades unidades_franqueado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_franqueado_id_fkey FOREIGN KEY (franqueado_id) REFERENCES public.franqueados(id);


--
-- Name: estoque_unidade Estoque das unidades pode ser consultado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estoque das unidades pode ser consultado" ON public.estoque_unidade FOR SELECT TO authenticated, anon USING (true);


--
-- Name: perfil_cliente Policy Name: usuario_atualiza_proprio_perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Policy Name: usuario_atualiza_proprio_perfil" ON public.perfil_cliente FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: perfil_cliente Policy Name: usuario_cria_proprio_perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Policy Name: usuario_cria_proprio_perfil" ON public.perfil_cliente FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: unidades Unidades ativas podem ser consultadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Unidades ativas podem ser consultadas" ON public.unidades FOR SELECT TO authenticated, anon USING ((ativo = true));


--
-- Name: pedidos admin_atualiza_pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_atualiza_pedidos ON public.pedidos FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.perfil_cliente
  WHERE ((perfil_cliente.user_id = auth.uid()) AND (perfil_cliente.tipo_usuario = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.perfil_cliente
  WHERE ((perfil_cliente.user_id = auth.uid()) AND (perfil_cliente.tipo_usuario = 'admin'::text)))));


--
-- Name: historico_pedido admin_le_historico_pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_le_historico_pedidos ON public.historico_pedido FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.perfil_cliente
  WHERE ((perfil_cliente.user_id = auth.uid()) AND (perfil_cliente.tipo_usuario = 'admin'::text)))));


--
-- Name: leituras_separacao admin_le_leituras_separacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_le_leituras_separacao ON public.leituras_separacao FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.perfil_cliente
  WHERE ((perfil_cliente.user_id = auth.uid()) AND (perfil_cliente.tipo_usuario = 'admin'::text)))));


--
-- Name: leituras_separacao admin_registra_leitura_separacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_registra_leitura_separacao ON public.leituras_separacao FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.perfil_cliente
  WHERE ((perfil_cliente.user_id = auth.uid()) AND (perfil_cliente.tipo_usuario = 'admin'::text))))));


--
-- Name: estoque_unidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estoque_unidade ENABLE ROW LEVEL SECURITY;

--
-- Name: franqueados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.franqueados ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_pedido; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_pedido ENABLE ROW LEVEL SECURITY;

--
-- Name: itens_pedido; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;

--
-- Name: itens_retirada; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.itens_retirada ENABLE ROW LEVEL SECURITY;

--
-- Name: produto_teste leitura_produtos_ativos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leitura_produtos_ativos ON public.produto_teste FOR SELECT USING ((ativo = true));


--
-- Name: leituras_separacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leituras_separacao ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: perfil_cliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perfil_cliente ENABLE ROW LEVEL SECURITY;

--
-- Name: pontos_retirada; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pontos_retirada ENABLE ROW LEVEL SECURITY;

--
-- Name: produto_teste; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produto_teste ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos publico_le_produtos_ativos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publico_le_produtos_ativos ON public.produtos FOR SELECT TO authenticated, anon USING ((ativo = true));


--
-- Name: retiradas_pedido; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retiradas_pedido ENABLE ROW LEVEL SECURITY;

--
-- Name: terminais_checkin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.terminais_checkin ENABLE ROW LEVEL SECURITY;

--
-- Name: unidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos usuario_cria_proprio_pedido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_cria_proprio_pedido ON public.pedidos FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: itens_pedido usuario_insere_itens_no_proprio_pedido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_insere_itens_no_proprio_pedido ON public.itens_pedido FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pedidos
  WHERE ((pedidos.id = itens_pedido.pedido_id) AND (pedidos.user_id = auth.uid())))));


--
-- Name: itens_pedido usuario_le_itens_dos_proprios_pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_le_itens_dos_proprios_pedidos ON public.itens_pedido FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pedidos
  WHERE ((pedidos.id = itens_pedido.pedido_id) AND (pedidos.user_id = auth.uid())))));


--
-- Name: perfil_cliente usuario_le_proprio_perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_le_proprio_perfil ON public.perfil_cliente FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: pedidos usuario_le_proprios_pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuario_le_proprios_pedidos ON public.pedidos FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: produtos usuarios_leem_produtos_ativos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usuarios_leem_produtos_ativos ON public.produtos FOR SELECT TO authenticated USING ((ativo = true));


--
-- PostgreSQL database dump complete
--

\unrestrict cJ7ebsalHMlrnZrS8szDdp1XhPHXdKCgsH5EqtcXaErlXNvM8XwL6IlVXmNfC1y

