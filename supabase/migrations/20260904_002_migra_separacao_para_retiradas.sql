-- =========================================================
-- O BOX DRIVER
-- Migração do fluxo de separação para retiradas_pedido
-- =========================================================


-- =========================================================
-- 1. COMPLEMENTA AUDITORIA
-- =========================================================

alter table public.historico_pedido
add column if not exists retirada_id uuid
references public.retiradas_pedido(id)
on delete cascade;

alter table public.leituras_separacao
add column if not exists retirada_id uuid
references public.retiradas_pedido(id)
on delete cascade;

alter table public.leituras_separacao
add column if not exists item_retirada_id uuid
references public.itens_retirada(id)
on delete cascade;


-- =========================================================
-- 2. NORMALIZA STATUS DAS RETIRADAS
--
-- A partir daqui usamos códigos internos sem espaços/acento.
-- A interface continuará exibindo textos amigáveis.
-- =========================================================

update public.retiradas_pedido
set status = 'em_separacao'
where status = 'em separação';


-- =========================================================
-- 3. INICIAR SEPARAÇÃO DE UMA RETIRADA
-- =========================================================

create or replace function public.iniciar_separacao_retirada(
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
  v_status_pagamento text;
begin

  -- -------------------------------------------------------
  -- Usuário autenticado
  -- -------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- -------------------------------------------------------
  -- Por enquanto mantemos a regra atual de admin.
  -- Depois evoluiremos para papéis de franqueado/unidade.
  -- -------------------------------------------------------

  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception
      'Usuário sem permissão para iniciar separação';
  end if;


  -- -------------------------------------------------------
  -- Busca e trava retirada
  -- -------------------------------------------------------

  select
    r.pedido_id,
    p.numero_pedido,
    r.sequencia,
    r.status,
    p.status_pagamento

  into
    v_pedido_id,
    v_numero_pedido,
    v_sequencia,
    v_status_retirada,
    v_status_pagamento

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
  -- Pagamento
  -- -------------------------------------------------------

  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido nº % ainda não possui pagamento aprovado',
      v_numero_pedido;
  end if;


  -- -------------------------------------------------------
  -- Status
  -- -------------------------------------------------------

  if v_status_retirada <> 'recebido' then
    raise exception
      'Retirada % do Pedido nº % não pode iniciar separação. Status atual: %',
      v_sequencia,
      v_numero_pedido,
      v_status_retirada;
  end if;


  -- -------------------------------------------------------
  -- Atualiza retirada
  -- -------------------------------------------------------

  update public.retiradas_pedido
  set
    status = 'em_separacao',
    separacao_iniciada_em = now(),
    separacao_iniciada_por = v_user_id
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
    'separacao_iniciada',
    'recebido',
    'em_separacao',
    'Separação da retirada iniciada'
  );


  return jsonb_build_object(
    'sucesso', true,
    'pedido', v_numero_pedido,
    'retirada', v_sequencia,
    'retirada_id', p_retirada_id,
    'status', 'em_separacao'
  );

end;
$$;


revoke all
on function public.iniciar_separacao_retirada(uuid)
from public;

grant execute
on function public.iniciar_separacao_retirada(uuid)
to authenticated;


-- =========================================================
-- 4. REGISTRAR LEITURA DE PRODUTO NA RETIRADA
-- =========================================================

create or replace function public.registrar_leitura_separacao_retirada(
  p_retirada_id uuid,
  p_codigo_lido text
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

  v_item_retirada_id uuid;
  v_item_pedido_id uuid;

  v_produto_nome text;
  v_codigo_produto text;

  v_quantidade bigint;
  v_quantidade_separada bigint;

  v_item_concluido boolean;
  v_retirada_concluida boolean;
begin

  -- -------------------------------------------------------
  -- Usuário
  -- -------------------------------------------------------

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
    raise exception
      'Usuário sem permissão para registrar separação';
  end if;


  -- -------------------------------------------------------
  -- Código
  -- -------------------------------------------------------

  if p_codigo_lido is null
     or trim(p_codigo_lido) = '' then
    raise exception
      'Código do produto não informado';
  end if;


  -- -------------------------------------------------------
  -- Busca e trava retirada
  -- -------------------------------------------------------

  select
    r.pedido_id,
    p.numero_pedido,
    r.sequencia,
    r.status

  into
    v_pedido_id,
    v_numero_pedido,
    v_sequencia,
    v_status_retirada

  from public.retiradas_pedido r

  join public.pedidos p
    on p.id = r.pedido_id

  where r.id = p_retirada_id

  for update of r;


  if not found then
    raise exception
      'Retirada não encontrada';
  end if;


  if v_status_retirada <> 'em_separacao' then
    raise exception
      'Retirada % do Pedido nº % não está em separação. Status atual: %',
      v_sequencia,
      v_numero_pedido,
      v_status_retirada;
  end if;


  -- -------------------------------------------------------
  -- Localiza item da retirada pelo código do produto
  -- -------------------------------------------------------

  select
    ir.id,
    ir.item_pedido_id,
    ip.nome_produto,
    ip.codigo_produto,
    ir.quantidade,
    ir.quantidade_separada

  into
    v_item_retirada_id,
    v_item_pedido_id,
    v_produto_nome,
    v_codigo_produto,
    v_quantidade,
    v_quantidade_separada

  from public.itens_retirada ir

  join public.itens_pedido ip
    on ip.id = ir.item_pedido_id

  where ir.retirada_id = p_retirada_id
    and ip.codigo_produto = trim(p_codigo_lido)

  for update of ir;


  if not found then
    raise exception
      'Produto % não pertence à retirada % do Pedido nº %',
      trim(p_codigo_lido),
      v_sequencia,
      v_numero_pedido;
  end if;


  -- -------------------------------------------------------
  -- Impede leitura além da quantidade necessária
  -- -------------------------------------------------------

  if v_quantidade_separada >= v_quantidade then
    raise exception
      'Produto % já está totalmente separado',
      v_produto_nome;
  end if;


  -- -------------------------------------------------------
  -- Incrementa quantidade separada
  -- -------------------------------------------------------

  update public.itens_retirada
  set quantidade_separada =
    quantidade_separada + 1
  where id = v_item_retirada_id
  returning quantidade_separada
  into v_quantidade_separada;


  -- -------------------------------------------------------
  -- Auditoria da leitura
  -- -------------------------------------------------------

  insert into public.leituras_separacao (
    pedido_id,
    retirada_id,
    item_pedido_id,
    item_retirada_id,
    user_id,
    codigo_lido
  )
  values (
    v_pedido_id,
    p_retirada_id,
    v_item_pedido_id,
    v_item_retirada_id,
    v_user_id,
    trim(p_codigo_lido)
  );


  -- -------------------------------------------------------
  -- Item concluído?
  -- -------------------------------------------------------

  v_item_concluido :=
    v_quantidade_separada >= v_quantidade;


  -- -------------------------------------------------------
  -- Toda a retirada foi concluída?
  -- -------------------------------------------------------

  select not exists (
    select 1
    from public.itens_retirada
    where retirada_id = p_retirada_id
      and quantidade_separada < quantidade
  )
  into v_retirada_concluida;


  -- -------------------------------------------------------
  -- Finalização automática da retirada
  -- -------------------------------------------------------

  if v_retirada_concluida then

    update public.retiradas_pedido
    set
      status = 'pronto_retirada',
      separacao_finalizada_em = now(),
      separacao_finalizada_por = v_user_id
    where id = p_retirada_id;


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
      'separacao_finalizada',
      'em_separacao',
      'pronto_retirada',
      'Todos os itens da retirada foram conferidos'
    );

  end if;


  return jsonb_build_object(
    'sucesso', true,

    'pedido', v_numero_pedido,
    'retirada', v_sequencia,
    'retirada_id', p_retirada_id,

    'codigo', v_codigo_produto,
    'produto', v_produto_nome,

    'quantidade_pedida', v_quantidade,
    'quantidade_separada', v_quantidade_separada,

    'item_concluido', v_item_concluido,
    'retirada_concluida', v_retirada_concluida,

    'status',
      case
        when v_retirada_concluida
          then 'pronto_retirada'
        else 'em_separacao'
      end
  );

end;
$$;


revoke all
on function public.registrar_leitura_separacao_retirada(uuid, text)
from public;

grant execute
on function public.registrar_leitura_separacao_retirada(uuid, text)
to authenticated;