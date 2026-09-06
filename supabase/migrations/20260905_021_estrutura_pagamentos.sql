-- =========================================================
-- O BOX DRIVER
-- Estrutura base de pagamentos
--
-- Métodos previstos:
-- - PIX
-- - Cartão de crédito
-- - Cartão de débito
--
-- Boleto NÃO faz parte do escopo.
-- =========================================================


-- =========================================================
-- 1. TABELA DE PAGAMENTOS
-- =========================================================

create table if not exists public.pagamentos (
  id uuid primary key
    default gen_random_uuid(),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  user_id uuid not null
    references auth.users(id),

  reserva_id uuid not null
    references public.reservas_estoque(id),

  pedido_id uuid null
    references public.pedidos(id),

  provedor text not null
    default 'mercado_pago',

  metodo text not null,

  status text not null
    default 'pendente',

  valor numeric(12,2) not null,

  moeda text not null
    default 'BRL',

  payment_id_provedor text null,

  external_reference text not null,

  idempotency_key uuid not null
    default gen_random_uuid(),

  status_detail text null,

  aprovado_em timestamptz null,

  recusado_em timestamptz null,

  cancelado_em timestamptz null,

  expirado_em timestamptz null,

  processando_em timestamptz null,

  metadata jsonb null
);


-- =========================================================
-- 2. CONSTRAINT DOS MÉTODOS
-- =========================================================

alter table public.pagamentos
drop constraint if exists
  pagamentos_metodo_check;

alter table public.pagamentos
add constraint
  pagamentos_metodo_check
check (
  metodo in (
    'pix',
    'credit_card',
    'debit_card'
  )
);


-- =========================================================
-- 3. CONSTRAINT DOS STATUS
-- =========================================================

alter table public.pagamentos
drop constraint if exists
  pagamentos_status_check;

alter table public.pagamentos
add constraint
  pagamentos_status_check
check (
  status in (
    'pendente',
    'processando',
    'aprovado',
    'recusado',
    'cancelado',
    'expirado'
  )
);


-- =========================================================
-- 4. VALOR
-- =========================================================

alter table public.pagamentos
drop constraint if exists
  pagamentos_valor_check;

alter table public.pagamentos
add constraint
  pagamentos_valor_check
check (
  valor > 0
);


-- =========================================================
-- 5. ÍNDICES
-- =========================================================

create index if not exists
  idx_pagamentos_user_id
on public.pagamentos(user_id);


create index if not exists
  idx_pagamentos_reserva_id
on public.pagamentos(reserva_id);


create index if not exists
  idx_pagamentos_pedido_id
on public.pagamentos(pedido_id);


create index if not exists
  idx_pagamentos_status
on public.pagamentos(status);


create index if not exists
  idx_pagamentos_payment_id_provedor
on public.pagamentos(payment_id_provedor);


create unique index if not exists
  uq_pagamentos_external_reference
on public.pagamentos(external_reference);


create unique index if not exists
  uq_pagamentos_idempotency_key
on public.pagamentos(idempotency_key);


-- =========================================================
-- 6. EVITA MAIS DE UM PAGAMENTO ATIVO
-- PARA A MESMA RESERVA E MESMO MÉTODO
-- =========================================================
--
-- Não impede histórico de pagamentos recusados/cancelados.
--
-- Impede duplicidade simultânea em:
-- pendente / processando / aprovado
-- =========================================================

create unique index if not exists
  uq_pagamento_ativo_reserva_metodo
on public.pagamentos(
  reserva_id,
  metodo
)
where status in (
  'pendente',
  'processando',
  'aprovado'
);


-- =========================================================
-- 7. TRIGGER UPDATED_AT
-- =========================================================

create or replace function
public.atualizar_updated_at_pagamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  new.updated_at :=
    now();

  return new;

end;
$$;


drop trigger if exists
  trg_pagamentos_updated_at
on public.pagamentos;


create trigger
  trg_pagamentos_updated_at

before update
on public.pagamentos

for each row

execute function
  public.atualizar_updated_at_pagamentos();


-- =========================================================
-- 8. RLS
-- =========================================================

alter table public.pagamentos
enable row level security;


-- =========================================================
-- 9. CLIENTE PODE VISUALIZAR APENAS
-- OS PRÓPRIOS PAGAMENTOS
-- =========================================================

drop policy if exists
  pagamentos_select_proprio
on public.pagamentos;


create policy
  pagamentos_select_proprio

on public.pagamentos

for select

to authenticated

using (
  user_id = auth.uid()
);


-- =========================================================
-- 10. CLIENTE NÃO ESCREVE DIRETAMENTE
-- =========================================================
--
-- INSERT / UPDATE / DELETE ocorrerão pelo backend.
-- =========================================================

revoke insert,
       update,
       delete
on public.pagamentos
from authenticated;


-- =========================================================
-- 11. LEITURA PARA AUTHENTICATED
-- =========================================================

grant select
on public.pagamentos
to authenticated;


-- =========================================================
-- 12. ACESSO TOTAL DO BACKEND
-- =========================================================

grant select,
      insert,
      update,
      delete
on public.pagamentos
to service_role;