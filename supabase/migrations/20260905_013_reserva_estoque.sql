-- =========================================================
-- O BOX DRIVER
-- Estrutura inicial de reserva temporária de estoque
-- =========================================================

-- =========================================================
-- 1. CONFIGURAÇÃO DO TEMPO DE RESERVA
-- =========================================================

create table if not exists public.configuracoes_sistema (
  chave text primary key,
  valor text not null,
  descricao text null,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_sistema (
  chave,
  valor,
  descricao
)
values (
  'tempo_reserva_estoque_minutos',
  '10',
  'Tempo padrão, em minutos, para reserva temporária de estoque durante o pagamento.'
)
on conflict (chave)
do update set
  valor = excluded.valor,
  descricao = excluded.descricao,
  updated_at = now();


-- =========================================================
-- 2. CABEÇALHO DA RESERVA
-- =========================================================

create table if not exists public.reservas_estoque (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),

  user_id uuid not null
    references auth.users(id),

  pedido_id uuid null
    references public.pedidos(id),

  status text not null default 'ativa',

  reservado_em timestamptz not null default now(),

  expira_em timestamptz not null,

  convertida_em timestamptz null,

  cancelada_em timestamptz null,

  constraint reservas_estoque_status_check
    check (
      status in (
        'ativa',
        'convertida',
        'expirada',
        'cancelada'
      )
    )
);

create index if not exists
  idx_reservas_estoque_user
on public.reservas_estoque(user_id);

create index if not exists
  idx_reservas_estoque_status_expira
on public.reservas_estoque(status, expira_em);

create index if not exists
  idx_reservas_estoque_pedido
on public.reservas_estoque(pedido_id);


-- =========================================================
-- 3. ITENS RESERVADOS POR UNIDADE
-- =========================================================

create table if not exists public.itens_reserva_estoque (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),

  reserva_id uuid not null
    references public.reservas_estoque(id)
    on delete cascade,

  unidade_id uuid not null
    references public.unidades(id),

  produto_id uuid not null
    references public.produtos(id),

  quantidade bigint not null,

  constraint itens_reserva_quantidade_check
    check (quantidade > 0),

  constraint itens_reserva_unico
    unique (
      reserva_id,
      unidade_id,
      produto_id
    )
);

create index if not exists
  idx_itens_reserva_produto_unidade
on public.itens_reserva_estoque(
  produto_id,
  unidade_id
);

create index if not exists
  idx_itens_reserva_reserva
on public.itens_reserva_estoque(
  reserva_id
);


-- =========================================================
-- 4. FUNÇÃO AUXILIAR
--    SOMA QUANTO ESTÁ RESERVADO E AINDA VÁLIDO
-- =========================================================

create or replace function public.quantidade_reservada_ativa(
  p_produto_id uuid,
  p_unidade_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      sum(ire.quantidade),
      0
    )::bigint
  from public.itens_reserva_estoque ire
  join public.reservas_estoque re
    on re.id = ire.reserva_id
  where ire.produto_id = p_produto_id
    and ire.unidade_id = p_unidade_id
    and re.status = 'ativa'
    and re.expira_em > now();
$$;


-- =========================================================
-- 5. FUNÇÃO AUXILIAR
--    ESTOQUE DISPONÍVEL PARA VENDA
--
-- físico - reservas válidas
-- =========================================================

create or replace function public.estoque_disponivel_unidade(
  p_produto_id uuid,
  p_unidade_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    greatest(
      coalesce(eu.quantidade, 0)
      -
      public.quantidade_reservada_ativa(
        p_produto_id,
        p_unidade_id
      ),
      0
    )::bigint
  from public.estoque_unidade eu
  where eu.produto_id = p_produto_id
    and eu.unidade_id = p_unidade_id;
$$;


-- =========================================================
-- 6. RLS
-- =========================================================

alter table public.reservas_estoque
enable row level security;

alter table public.itens_reserva_estoque
enable row level security;


-- Cliente vê apenas as próprias reservas
drop policy if exists
  reservas_estoque_cliente_select
on public.reservas_estoque;

create policy
  reservas_estoque_cliente_select
on public.reservas_estoque
for select
to authenticated
using (
  user_id = auth.uid()
);


-- Cliente vê itens somente das próprias reservas
drop policy if exists
  itens_reserva_cliente_select
on public.itens_reserva_estoque;

create policy
  itens_reserva_cliente_select
on public.itens_reserva_estoque
for select
to authenticated
using (
  exists (
    select 1
    from public.reservas_estoque re
    where re.id = reserva_id
      and re.user_id = auth.uid()
  )
);


-- =========================================================
-- 7. PERMISSÕES
--
-- Escrita será feita por RPC/backend.
-- Não liberamos INSERT/UPDATE direto ao navegador.
-- =========================================================

grant select
on public.reservas_estoque
to authenticated;

grant select
on public.itens_reserva_estoque
to authenticated;

grant select
on public.configuracoes_sistema
to authenticated;

grant execute
on function public.quantidade_reservada_ativa(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.estoque_disponivel_unidade(uuid, uuid)
to authenticated, service_role;