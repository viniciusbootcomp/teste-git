-- =========================================================
-- 042 - PERMISSÕES OPERACIONAIS MÚLTIPLAS POR USUÁRIO
-- O Box Driver - Homologação / Fase 1
--
-- Objetivo:
-- permitir que um mesmo usuário acumule capacidades operacionais
-- (ex.: separação + retirada) sem precisar criar perfis híbridos.
--
-- Estratégia:
-- - perfil_cliente.tipo_usuario continua existindo como perfil principal;
-- - usuario_permissoes armazena capacidades adicionais;
-- - admin/admin_rede possuem todas as permissões operacionais;
-- - usuários existentes de separacao/retirada são migrados automaticamente;
-- - nenhuma tela/RPC antiga quebra com esta migration.
-- =========================================================


-- =========================================================
-- 1. TABELA DE PERMISSÕES
-- =========================================================

create table if not exists public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),

  created_at timestamptz not null default now(),

  user_id uuid not null,

  permissao text not null,

  ativo boolean not null default true,

  concedida_por_user_id uuid null,

  constraint usuario_permissoes_permissao_check
    check (
      permissao in (
        'separacao',
        'retirada'
      )
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
    where conname = 'usuario_permissoes_user_id_fkey'
      and conrelid = 'public.usuario_permissoes'::regclass
  ) then
    alter table public.usuario_permissoes
    add constraint usuario_permissoes_user_id_fkey
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
    where conname = 'usuario_permissoes_concedida_por_user_id_fkey'
      and conrelid = 'public.usuario_permissoes'::regclass
  ) then
    alter table public.usuario_permissoes
    add constraint usuario_permissoes_concedida_por_user_id_fkey
    foreign key (concedida_por_user_id)
    references auth.users(id)
    on delete set null;
  end if;
end;
$$;


-- =========================================================
-- 3. UNICIDADE E ÍNDICES
-- =========================================================

create unique index if not exists
  ux_usuario_permissoes_user_permissao
on public.usuario_permissoes(user_id, permissao);

create index if not exists
  ix_usuario_permissoes_user_ativo
on public.usuario_permissoes(user_id, ativo);

create index if not exists
  ix_usuario_permissoes_permissao_ativo
on public.usuario_permissoes(permissao, ativo);


-- =========================================================
-- 4. MIGRA PERFIS OPERACIONAIS EXISTENTES
-- =========================================================
-- Mantém compatibilidade:
-- - quem já era separacao recebe capacidade separacao;
-- - quem já era retirada recebe capacidade retirada.
-- =========================================================

insert into public.usuario_permissoes (
  user_id,
  permissao,
  ativo
)
select
  pc.user_id,
  pc.tipo_usuario,
  true
from public.perfil_cliente pc
where pc.user_id is not null
  and pc.ativo = true
  and pc.tipo_usuario in ('separacao', 'retirada')
on conflict (user_id, permissao)
do update
set ativo = excluded.ativo;


-- =========================================================
-- 5. FUNÇÃO CENTRAL DE AUTORIZAÇÃO
-- =========================================================
-- Essa função será usada gradualmente pelas RPCs, RLS e telas.
--
-- Regras:
-- 1. usuário precisa estar autenticado;
-- 2. perfil_cliente precisa estar ativo;
-- 3. admin/admin_rede possuem todas as permissões operacionais;
-- 4. perfil principal legado ainda é aceito durante a transição;
-- 5. senão, verifica usuario_permissoes.
-- =========================================================

create or replace function public.usuario_atual_tem_permissao(
  p_permissao text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.perfil_cliente pc
      where pc.user_id = auth.uid()
        and pc.ativo = true
        and (
          pc.tipo_usuario in ('admin', 'admin_rede')

          or pc.tipo_usuario = p_permissao

          or exists (
            select 1
            from public.usuario_permissoes up
            where up.user_id = pc.user_id
              and up.permissao = p_permissao
              and up.ativo = true
          )
        )
    );
$$;

revoke all
on function public.usuario_atual_tem_permissao(text)
from public;

grant execute
on function public.usuario_atual_tem_permissao(text)
to authenticated;


-- =========================================================
-- 6. RLS DA TABELA DE PERMISSÕES
-- =========================================================

alter table public.usuario_permissoes
enable row level security;

drop policy if exists
  usuario_permissoes_select_proprio
on public.usuario_permissoes;

create policy
  usuario_permissoes_select_proprio
on public.usuario_permissoes
for select
to authenticated
using (
  user_id = auth.uid()
);


-- Usuário comum não altera suas próprias permissões.
revoke insert, update, delete
on public.usuario_permissoes
from authenticated;

grant select
on public.usuario_permissoes
to authenticated;

grant select, insert, update, delete
on public.usuario_permissoes
to service_role;


-- =========================================================
-- 7. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   pc.nome,
--   pc.tipo_usuario,
--   up.permissao,
--   up.ativo
-- from public.perfil_cliente pc
-- left join public.usuario_permissoes up
--   on up.user_id = pc.user_id
-- order by pc.nome, up.permissao;
--
-- Teste com o usuário logado:
--
-- select public.usuario_atual_tem_permissao('separacao');
-- select public.usuario_atual_tem_permissao('retirada');
--
-- =========================================================
