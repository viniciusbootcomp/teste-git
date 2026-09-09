-- =========================================================
-- 033 - ESTRUTURA DE USUÁRIOS ADMINISTRATIVOS
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Preparar perfil_cliente para usuários internos
-- 2. Criar status ativo/inativo
-- 3. Permitir vínculo opcional com unidade e franqueado
-- 4. Padronizar os tipos de usuário permitidos
-- 5. Garantir um único perfil por usuário do Supabase Auth
--
-- Observação:
-- O usuário atual do protótipo continua usando tipo_usuario = 'admin'.
-- Na aplicação oficial, poderemos evoluir 'admin' para 'admin_rede'
-- sem precisar mudar toda a arquitetura.
-- =========================================================


-- =========================================================
-- 1. VALIDA PERFIS DUPLICADOS ANTES DE CRIAR UNICIDADE
-- =========================================================

do $$
begin
  if exists (
    select user_id
    from public.perfil_cliente
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) then
    raise exception
      'Existem perfis duplicados para o mesmo user_id em perfil_cliente. Corrija antes de aplicar a migration.';
  end if;
end;
$$;


-- =========================================================
-- 2. NOVOS CAMPOS
-- =========================================================

alter table public.perfil_cliente
add column if not exists ativo boolean not null default true;

alter table public.perfil_cliente
add column if not exists unidade_id uuid;

alter table public.perfil_cliente
add column if not exists franqueado_id uuid;


-- =========================================================
-- 3. PADRONIZA TIPO_USUARIO
-- =========================================================
--
-- Tipos previstos:
--
-- cliente         = cliente final
-- admin           = administrador geral do protótipo
-- admin_rede      = administrador da rede
-- franqueado      = operador/franqueado
-- gestor_unidade  = gestor de uma unidade
-- separacao       = equipe de separação
-- retirada        = equipe de retirada/entrega
-- =========================================================

alter table public.perfil_cliente
drop constraint if exists perfil_cliente_tipo_usuario_check;

alter table public.perfil_cliente
add constraint perfil_cliente_tipo_usuario_check
check (
  tipo_usuario in (
    'cliente',
    'admin',
    'admin_rede',
    'franqueado',
    'gestor_unidade',
    'separacao',
    'retirada'
  )
);


-- =========================================================
-- 4. UM PERFIL POR USUÁRIO AUTH
-- =========================================================

create unique index if not exists
  ux_perfil_cliente_user_id
on public.perfil_cliente(user_id)
where user_id is not null;


-- =========================================================
-- 5. FOREIGN KEY PARA UNIDADE
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'perfil_cliente_unidade_id_fkey'
      and conrelid = 'public.perfil_cliente'::regclass
  ) then
    alter table public.perfil_cliente
    add constraint perfil_cliente_unidade_id_fkey
    foreign key (unidade_id)
    references public.unidades(id)
    on update cascade
    on delete set null;
  end if;
end;
$$;


-- =========================================================
-- 6. FOREIGN KEY PARA FRANQUEADO
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'perfil_cliente_franqueado_id_fkey'
      and conrelid = 'public.perfil_cliente'::regclass
  ) then
    alter table public.perfil_cliente
    add constraint perfil_cliente_franqueado_id_fkey
    foreign key (franqueado_id)
    references public.franqueados(id)
    on update cascade
    on delete set null;
  end if;
end;
$$;


-- =========================================================
-- 7. ÍNDICES DE APOIO
-- =========================================================

create index if not exists
  ix_perfil_cliente_tipo_usuario
on public.perfil_cliente(tipo_usuario);

create index if not exists
  ix_perfil_cliente_unidade_id
on public.perfil_cliente(unidade_id);

create index if not exists
  ix_perfil_cliente_franqueado_id
on public.perfil_cliente(franqueado_id);


-- =========================================================
-- 8. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   user_id,
--   nome,
--   tipo_usuario,
--   ativo,
--   unidade_id,
--   franqueado_id
-- from public.perfil_cliente
-- order by created_at;
--
-- =========================================================
