-- =========================================================
-- 031 - CODIGO UNICO PARA PRODUTOS
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Garantir que todo produto tenha código
-- 2. Normalizar espaços em branco
-- 3. Impedir códigos duplicados, ignorando maiúsculas/minúsculas
-- 4. Preparar o cadastro e a futura importação por Excel
--
-- Observação:
-- Antes de criar o índice, a migration valida se existem
-- códigos nulos, vazios ou duplicados.
-- =========================================================

-- =========================================================
-- 1. NORMALIZA CÓDIGOS EXISTENTES
-- =========================================================

update public.produtos
set codigo = upper(trim(codigo))
where codigo is not null;


-- =========================================================
-- 2. VALIDA CÓDIGOS NULOS OU VAZIOS
-- =========================================================

do $$
begin
  if exists (
    select 1
    from public.produtos
    where codigo is null
       or trim(codigo) = ''
  ) then
    raise exception
      'Existem produtos sem código. Corrija-os antes de aplicar a unicidade.';
  end if;
end;
$$;


-- =========================================================
-- 3. VALIDA DUPLICIDADES
--    Ex.: BOX-133 e box-133 são considerados o mesmo código
-- =========================================================

do $$
begin
  if exists (
    select upper(trim(codigo))
    from public.produtos
    group by upper(trim(codigo))
    having count(*) > 1
  ) then
    raise exception
      'Existem códigos de produto duplicados. Corrija-os antes de aplicar a unicidade.';
  end if;
end;
$$;


-- =========================================================
-- 4. TORNA O CÓDIGO OBRIGATÓRIO
-- =========================================================

alter table public.produtos
alter column codigo set not null;


-- =========================================================
-- 5. GARANTE CÓDIGO NÃO VAZIO
-- =========================================================

alter table public.produtos
drop constraint if exists produtos_codigo_nao_vazio_check;

alter table public.produtos
add constraint produtos_codigo_nao_vazio_check
check (
  trim(codigo) <> ''
);


-- =========================================================
-- 6. ÍNDICE ÚNICO CASE-INSENSITIVE
-- =========================================================

create unique index if not exists ux_produtos_codigo_normalizado
on public.produtos (
  upper(trim(codigo))
);


-- =========================================================
-- 7. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   id,
--   codigo,
--   nome
-- from public.produtos
-- order by codigo;
--
-- =========================================================
