-- =========================================================
-- O BOX DRIVER
-- QR e check-in passam a pertencer à retirada
-- =========================================================


-- =========================================================
-- 1. LEITURA DA RETIRADA PELO CLIENTE
-- =========================================================

grant select
on public.retiradas_pedido
to authenticated;

grant select
on public.itens_retirada
to authenticated;


drop policy if exists
"Cliente pode consultar suas retiradas"
on public.retiradas_pedido;

create policy
"Cliente pode consultar suas retiradas"
on public.retiradas_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.pedidos p
    where p.id = retiradas_pedido.pedido_id
      and p.user_id = auth.uid()
  )
);


drop policy if exists
"Cliente pode consultar itens de suas retiradas"
on public.itens_retirada;

create policy
"Cliente pode consultar itens de suas retiradas"
on public.itens_retirada
for select
to authenticated
using (
  exists (
    select 1
    from public.retiradas_pedido r

    join public.pedidos p
      on p.id = r.pedido_id

    where r.id = itens_retirada.retirada_id
      and p.user_id = auth.uid()
  )
);


-- =========================================================
-- 2. CHECK-IN DO TOTEM POR RETIRADA
--
-- Essa função NÃO depende de auth.uid().
-- Somente nosso backend com service_role poderá executá-la.
-- =========================================================

create or replace function public.registrar_checkin_totem_retirada(
  p_token_retirada uuid,
  p_terminal_identificador text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_numero_pedido bigint;

  v_retirada_id uuid;
  v_sequencia integer;
  v_status_retirada text;

  v_status_pagamento text;

  v_unidade_retirada_id uuid;
  v_unidade_terminal_id uuid;

  v_ponto_retirada_id uuid;
  v_ponto_nome text;
  v_instrucao_cliente text;

  v_terminal_id uuid;
  v_terminal_nome text;
begin

  -- =====================================================
  -- TERMINAL
  -- =====================================================

  select
    id,
    nome,
    unidade_id

  into
    v_terminal_id,
    v_terminal_nome,
    v_unidade_terminal_id

  from public.terminais_checkin

  where identificador = trim(p_terminal_identificador)
    and ativo = true;


  if not found then
    raise exception
      'Terminal de check-in inválido ou inativo';
  end if;


  if v_unidade_terminal_id is null then
    raise exception
      'Terminal não está vinculado a uma unidade';
  end if;


  -- =====================================================
  -- RETIRADA
  -- =====================================================

  select
    r.id,
    r.pedido_id,
    p.numero_pedido,
    r.sequencia,
    r.status,
    p.status_pagamento,
    r.unidade_id,
    r.ponto_retirada_id

  into
    v_retirada_id,
    v_pedido_id,
    v_numero_pedido,
    v_sequencia,
    v_status_retirada,
    v_status_pagamento,
    v_unidade_retirada_id,
    v_ponto_retirada_id

  from public.retiradas_pedido r

  join public.pedidos p
    on p.id = r.pedido_id

  where r.token_retirada = p_token_retirada

  for update of r;


  if not found then
    raise exception
      'QR Code inválido';
  end if;


  -- =====================================================
  -- PAGAMENTO
  -- =====================================================

  if v_status_pagamento <> 'aprovado' then
    raise exception
      'Pedido nº % ainda não possui pagamento aprovado',
      v_numero_pedido;
  end if;


  -- =====================================================
  -- UNIDADE
  --
  -- QR de Mogi não pode ser utilizado em Suzano.
  -- =====================================================

  if v_unidade_retirada_id <> v_unidade_terminal_id then
    raise exception
      'Esta retirada pertence a outra unidade do O Box Driver';
  end if;


  -- =====================================================
  -- STATUS
  -- =====================================================

  if v_status_retirada = 'entregue' then
    raise exception
      'Retirada % do Pedido nº % já foi entregue',
      v_sequencia,
      v_numero_pedido;
  end if;


  if v_status_retirada = 'cliente_no_local' then
    raise exception
      'Check-in da Retirada % do Pedido nº % já foi realizado',
      v_sequencia,
      v_numero_pedido;
  end if;


  if v_status_retirada <> 'pronto_retirada' then
    raise exception
      'Retirada % do Pedido nº % não está liberada. Status atual: %',
      v_sequencia,
      v_numero_pedido,
      v_status_retirada;
  end if;


  -- =====================================================
  -- PONTO DE RETIRADA
  -- =====================================================

  if v_ponto_retirada_id is null then
    raise exception
      'Retirada não possui ponto de retirada definido';
  end if;


  select
    nome,
    instrucao_cliente

  into
    v_ponto_nome,
    v_instrucao_cliente

  from public.pontos_retirada

  where id = v_ponto_retirada_id
    and unidade_id = v_unidade_retirada_id
    and ativo = true;


  if not found then
    raise exception
      'Ponto de retirada não encontrado ou inativo';
  end if;


  -- =====================================================
  -- CHECK-IN
  -- =====================================================

  update public.retiradas_pedido
  set
    status = 'cliente_no_local',
    checkin_em = now(),
    terminal_checkin_id = v_terminal_id
  where id = v_retirada_id;


  -- =====================================================
  -- HISTÓRICO
  -- =====================================================

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
    v_retirada_id,
    null,
    'checkin_totem',
    'pronto_retirada',
    'cliente_no_local',
    'Check-in da retirada realizado no terminal ' ||
      v_terminal_nome
  );


  -- =====================================================
  -- RETORNO
  -- =====================================================

  return jsonb_build_object(
    'sucesso', true,

    'pedido', v_numero_pedido,
    'retirada', v_sequencia,
    'retirada_id', v_retirada_id,

    'status', 'cliente_no_local',

    'terminal', v_terminal_nome,

    'ponto_retirada', v_ponto_nome,
    'instrucao_cliente', v_instrucao_cliente
  );

end;
$$;


-- =========================================================
-- 3. PERMISSÕES DA RPC
-- =========================================================

revoke all
on function public.registrar_checkin_totem_retirada(uuid, text)
from public;

revoke all
on function public.registrar_checkin_totem_retirada(uuid, text)
from anon;

revoke all
on function public.registrar_checkin_totem_retirada(uuid, text)
from authenticated;

grant execute
on function public.registrar_checkin_totem_retirada(uuid, text)
to service_role;