-- =========================================================
-- O BOX DRIVER
-- Fila e entrega passam a operar por retirada
-- =========================================================


-- =========================================================
-- 1. GARANTE LEITURA ADMINISTRATIVA DOS PEDIDOS
--
-- Isso corrige também uma pendência que identificamos
-- na revisão: um admin precisa enxergar pedidos de
-- clientes diferentes, não apenas os próprios pedidos.
-- =========================================================

grant select
on public.pedidos
to authenticated;

grant select
on public.itens_pedido
to authenticated;


drop policy if exists
"Admin pode consultar todos os pedidos"
on public.pedidos;

create policy
"Admin pode consultar todos os pedidos"
on public.pedidos
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente
    where perfil_cliente.user_id = auth.uid()
      and perfil_cliente.tipo_usuario = 'admin'
  )
);


drop policy if exists
"Admin pode consultar todos os itens dos pedidos"
on public.itens_pedido;

create policy
"Admin pode consultar todos os itens dos pedidos"
on public.itens_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente
    where perfil_cliente.user_id = auth.uid()
      and perfil_cliente.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 2. CONFIRMAR ENTREGA DE UMA RETIRADA
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
begin

  -- -------------------------------------------------------
  -- Usuário autenticado
  -- -------------------------------------------------------

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;


  -- -------------------------------------------------------
  -- Permissão
  --
  -- Por enquanto mantemos admin.
  -- Depois evoluiremos para funcionário/franqueado/unidade.
  -- -------------------------------------------------------

  if not exists (
    select 1
    from public.perfil_cliente
    where user_id = v_user_id
      and tipo_usuario = 'admin'
  ) then
    raise exception
      'Usuário sem permissão para confirmar entrega';
  end if;


  -- -------------------------------------------------------
  -- Busca e trava a retirada
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
  -- Validação de status
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