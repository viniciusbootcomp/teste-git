-- =========================================================
-- O BOX DRIVER
-- Unidade fictícia de laboratório para testes multiunidade
-- =========================================================


-- =========================================================
-- 1. CRIA UNIDADE SUZANO-01
-- =========================================================

insert into public.unidades (
  codigo,
  nome,
  cidade,
  estado,
  ativo,
  franqueado_id
)
select
  'SUZANO-01',
  'O Box Driver - Suzano 01',
  'Suzano',
  'SP',
  true,
  f.id
from public.franqueados f
where f.codigo = 'OPERACAO-01'
and not exists (
  select 1
  from public.unidades u
  where u.codigo = 'SUZANO-01'
);


-- =========================================================
-- 2. CRIA PONTO DE RETIRADA DA UNIDADE
-- =========================================================

insert into public.pontos_retirada (
  unidade_id,
  nome,
  instrucao_cliente,
  ativo
)
select
  u.id,
  'Ponto A',
  'Dirija-se ao ponto de retirada indicado no local.',
  true
from public.unidades u
where u.codigo = 'SUZANO-01'
and not exists (
  select 1
  from public.pontos_retirada p
  where p.unidade_id = u.id
    and p.nome = 'Ponto A'
);


-- =========================================================
-- 3. CRIA ESTOQUE DE TESTE
--
-- Queremos exatamente o cenário:
--
-- Silicone:
-- Mogi   20
-- Suzano  3
--
-- =========================================================

insert into public.estoque_unidade (
  unidade_id,
  produto_id,
  quantidade
)
select
  u.id,
  p.id,
  3
from public.unidades u
join public.produtos p
  on p.codigo = 'SIL-PU-001'
where u.codigo = 'SUZANO-01'
and not exists (
  select 1
  from public.estoque_unidade eu
  where eu.unidade_id = u.id
    and eu.produto_id = p.id
);


-- =========================================================
-- 4. GARANTE QUE O SALDO DE SUZANO SEJA 3
-- =========================================================

update public.estoque_unidade eu
set quantidade = 3
from public.unidades u,
     public.produtos p
where eu.unidade_id = u.id
  and eu.produto_id = p.id
  and u.codigo = 'SUZANO-01'
  and p.codigo = 'SIL-PU-001';