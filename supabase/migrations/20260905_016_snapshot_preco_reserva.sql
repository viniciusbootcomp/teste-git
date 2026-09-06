-- =========================================================
-- O BOX DRIVER
-- Snapshot comercial dos itens da reserva
--
-- Objetivo:
-- congelar nome, código e preço no instante em que
-- o estoque é reservado para pagamento.
-- =========================================================


-- =========================================================
-- 1. NOVOS CAMPOS
-- =========================================================

alter table public.itens_reserva_estoque
add column if not exists nome_produto text;

alter table public.itens_reserva_estoque
add column if not exists codigo_produto text;

alter table public.itens_reserva_estoque
add column if not exists preco_unitario numeric(12,2);


-- =========================================================
-- 2. PREENCHE RESERVAS ANTIGAS DE LABORATÓRIO
-- =========================================================

update public.itens_reserva_estoque ire
set
  nome_produto = p.nome,
  codigo_produto = p.codigo,
  preco_unitario = p.preco
from public.produtos p
where p.id = ire.produto_id
  and (
    ire.nome_produto is null
    or ire.codigo_produto is null
    or ire.preco_unitario is null
  );


-- =========================================================
-- 3. CAMPOS PASSAM A SER OBRIGATÓRIOS
-- =========================================================

alter table public.itens_reserva_estoque
alter column nome_produto
set not null;

alter table public.itens_reserva_estoque
alter column codigo_produto
set not null;

alter table public.itens_reserva_estoque
alter column preco_unitario
set not null;


-- =========================================================
-- 4. VALIDAÇÃO DO PREÇO
-- =========================================================

alter table public.itens_reserva_estoque
drop constraint if exists
  itens_reserva_preco_check;

alter table public.itens_reserva_estoque
add constraint
  itens_reserva_preco_check
check (
  preco_unitario >= 0
);


-- =========================================================
-- 5. FUNÇÃO QUE CRIA O SNAPSHOT AUTOMATICAMENTE
--
-- Toda vez que criar um item de reserva:
--
-- produto atual
-- ↓
-- nome / código / preço
-- ↓
-- ficam congelados na reserva
-- =========================================================

create or replace function
public.preencher_snapshot_item_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_codigo text;
  v_preco numeric(12,2);
begin

  select
    p.nome,
    p.codigo,
    p.preco

  into
    v_nome,
    v_codigo,
    v_preco

  from public.produtos p

  where p.id = new.produto_id
    and p.ativo = true;


  if not found then
    raise exception
      'Produto não encontrado ou inativo';
  end if;


  new.nome_produto :=
    v_nome;

  new.codigo_produto :=
    v_codigo;

  new.preco_unitario :=
    v_preco;


  return new;

end;
$$;


-- =========================================================
-- 6. TRIGGER
-- =========================================================

drop trigger if exists
  trg_snapshot_item_reserva
on public.itens_reserva_estoque;


create trigger
  trg_snapshot_item_reserva

before insert
on public.itens_reserva_estoque

for each row

execute function
  public.preencher_snapshot_item_reserva();