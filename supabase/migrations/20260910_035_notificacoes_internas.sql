-- =========================================================
-- 035 - NOTIFICAÇÕES INTERNAS
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Criar uma central única de notificações
-- 2. Permitir destino por usuário, perfil e/ou unidade
-- 3. Permitir vínculo opcional com pedido e retirada
-- 4. Preparar contador de não lidas e central de notificações
-- 5. Aplicar RLS para leitura segura
-- =========================================================


-- =========================================================
-- 1. TABELA PRINCIPAL
-- =========================================================

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),

  titulo text not null,
  mensagem text not null,

  tipo text not null default 'sistema',

  user_id uuid null,
  perfil_destino text null,
  unidade_id uuid null,

  pedido_id uuid null,
  retirada_id uuid null,

  link text null,

  lida boolean not null default false,
  lida_em timestamptz null,

  criada_por_user_id uuid null,

  constraint notificacoes_titulo_check
    check (length(trim(titulo)) > 0),

  constraint notificacoes_mensagem_check
    check (length(trim(mensagem)) > 0),

  constraint notificacoes_tipo_check
    check (
      tipo in (
        'sistema',
        'pedido_pago',
        'retirada_pronta',
        'checkin',
        'retirada_concluida',
        'operacional',
        'administrativa'
      )
    ),

  constraint notificacoes_perfil_destino_check
    check (
      perfil_destino is null
      or perfil_destino in (
        'cliente',
        'admin',
        'admin_rede',
        'franqueado',
        'gestor_unidade',
        'separacao',
        'retirada'
      )
    ),

  constraint notificacoes_destino_check
    check (
      user_id is not null
      or perfil_destino is not null
      or unidade_id is not null
    )
);


-- =========================================================
-- 2. FOREIGN KEYS
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notificacoes_user_id_fkey'
      and conrelid = 'public.notificacoes'::regclass
  ) then
    alter table public.notificacoes
    add constraint notificacoes_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete cascade;
  end if;
end;
$$;


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notificacoes_criada_por_user_id_fkey'
      and conrelid = 'public.notificacoes'::regclass
  ) then
    alter table public.notificacoes
    add constraint notificacoes_criada_por_user_id_fkey
    foreign key (criada_por_user_id)
    references auth.users(id)
    on delete set null;
  end if;
end;
$$;


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notificacoes_unidade_id_fkey'
      and conrelid = 'public.notificacoes'::regclass
  ) then
    alter table public.notificacoes
    add constraint notificacoes_unidade_id_fkey
    foreign key (unidade_id)
    references public.unidades(id)
    on update cascade
    on delete set null;
  end if;
end;
$$;


-- pedido_id e retirada_id são deixados sem FK nesta migration
-- para evitar acoplamento a nomes/estruturas que podem evoluir.
-- Quando consolidarmos definitivamente essas tabelas, adicionamos
-- as FKs em migration própria.


-- =========================================================
-- 3. ÍNDICES
-- =========================================================

create index if not exists
  ix_notificacoes_user_id
on public.notificacoes(user_id);

create index if not exists
  ix_notificacoes_perfil_destino
on public.notificacoes(perfil_destino);

create index if not exists
  ix_notificacoes_unidade_id
on public.notificacoes(unidade_id);

create index if not exists
  ix_notificacoes_lida
on public.notificacoes(lida);

create index if not exists
  ix_notificacoes_created_at
on public.notificacoes(created_at desc);

create index if not exists
  ix_notificacoes_user_nao_lidas
on public.notificacoes(user_id, lida, created_at desc);

create index if not exists
  ix_notificacoes_perfil_unidade
on public.notificacoes(perfil_destino, unidade_id, lida, created_at desc);


-- =========================================================
-- 4. RLS
-- =========================================================

alter table public.notificacoes enable row level security;


-- =========================================================
-- 5. LEITURA
-- =========================================================
--
-- Usuário pode ler:
-- 1. notificações destinadas diretamente a ele
-- 2. notificações destinadas ao perfil dele
-- 3. notificações da unidade dele
--
-- Quando perfil + unidade estiverem informados juntos,
-- ambos devem bater.
-- =========================================================

drop policy if exists
  notificacoes_select_usuario
on public.notificacoes;

create policy notificacoes_select_usuario
on public.notificacoes
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and (
        notificacoes.user_id = auth.uid()

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is not null
          and notificacoes.perfil_destino = pc.tipo_usuario
          and (
            notificacoes.unidade_id is null
            or notificacoes.unidade_id = pc.unidade_id
          )
        )

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is null
          and notificacoes.unidade_id is not null
          and notificacoes.unidade_id = pc.unidade_id
        )
      )
  )
);


-- =========================================================
-- 6. ATUALIZAÇÃO DE LIDA
-- =========================================================
--
-- Usuário pode alterar somente notificações que ele pode ler.
-- A aplicação deve atualizar apenas lida/lida_em.
-- =========================================================

drop policy if exists
  notificacoes_update_usuario
on public.notificacoes;

create policy notificacoes_update_usuario
on public.notificacoes
for update
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and (
        notificacoes.user_id = auth.uid()

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is not null
          and notificacoes.perfil_destino = pc.tipo_usuario
          and (
            notificacoes.unidade_id is null
            or notificacoes.unidade_id = pc.unidade_id
          )
        )

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is null
          and notificacoes.unidade_id is not null
          and notificacoes.unidade_id = pc.unidade_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.ativo = true
      and (
        notificacoes.user_id = auth.uid()

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is not null
          and notificacoes.perfil_destino = pc.tipo_usuario
          and (
            notificacoes.unidade_id is null
            or notificacoes.unidade_id = pc.unidade_id
          )
        )

        or (
          notificacoes.user_id is null
          and notificacoes.perfil_destino is null
          and notificacoes.unidade_id is not null
          and notificacoes.unidade_id = pc.unidade_id
        )
      )
  )
);


-- =========================================================
-- 7. INSERT / DELETE
-- =========================================================
--
-- Navegador não cria nem apaga notificações diretamente.
-- Essas operações devem passar pelo backend seguro.
-- =========================================================

revoke insert, delete
on public.notificacoes
from authenticated;

grant select, update
on public.notificacoes
to authenticated;

grant select, insert, update, delete
on public.notificacoes
to service_role;


-- =========================================================
-- 8. FUNÇÃO PARA MARCAR LIDA
-- =========================================================

create or replace function public.marcar_notificacao_lida(
  p_notificacao_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.notificacoes
  set
    lida = true,
    lida_em = coalesce(lida_em, now())
  where id = p_notificacao_id;
end;
$$;

grant execute
on function public.marcar_notificacao_lida(uuid)
to authenticated;


-- =========================================================
-- 9. FUNÇÃO PARA MARCAR TODAS COMO LIDAS
-- =========================================================

create or replace function public.marcar_todas_notificacoes_lidas()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.notificacoes
  set
    lida = true,
    lida_em = coalesce(lida_em, now())
  where lida = false;
end;
$$;

grant execute
on function public.marcar_todas_notificacoes_lidas()
to authenticated;


-- =========================================================
-- 10. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   id,
--   titulo,
--   tipo,
--   user_id,
--   perfil_destino,
--   unidade_id,
--   lida,
--   created_at
-- from public.notificacoes
-- order by created_at desc;
--
-- =========================================================
