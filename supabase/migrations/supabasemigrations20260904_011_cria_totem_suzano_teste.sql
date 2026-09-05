-- =========================================================
-- O BOX DRIVER
-- TOTEM-02 DE LABORATÓRIO - SUZANO
-- =========================================================
--
-- Objetivo:
--
-- TOTEM-01 -> MOGI-01
-- TOTEM-02 -> SUZANO-01
--
-- O TOTEM-02 existe apenas para validar o fluxo
-- multiunidade e o bloqueio de QR por unidade.
-- =========================================================


-- =========================================================
-- 1. CRIA TOTEM-02 EM SUZANO
-- =========================================================

insert into public.terminais_checkin (
  nome,
  identificador,
  localizacao,
  ativo,
  unidade_id
)
select
  'Totem 02',
  'TOTEM-02',
  'Entrada principal',
  true,
  u.id
from public.unidades u
where u.codigo = 'SUZANO-01'
  and not exists (
    select 1
    from public.terminais_checkin tc
    where tc.identificador = 'TOTEM-02'
  );


-- =========================================================
-- 2. GARANTE QUE O TOTEM-02 ESTEJA LIGADO À SUZANO-01
-- =========================================================

update public.terminais_checkin tc
set
  nome = 'Totem 02',
  localizacao = 'Entrada principal',
  ativo = true,
  unidade_id = u.id
from public.unidades u
where tc.identificador = 'TOTEM-02'
  and u.codigo = 'SUZANO-01';