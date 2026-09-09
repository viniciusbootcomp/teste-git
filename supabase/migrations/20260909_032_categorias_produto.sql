-- =========================================================
-- 032 - CATEGORIAS DE PRODUTO
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Criar cadastro próprio de categorias
-- 2. Migrar categorias já existentes em public.produtos
-- 3. Criar relacionamento produtos -> categorias_produto
-- 4. Evitar categorias duplicadas por diferença de grafia/capitalização
-- 5. Preparar o cadastro de produto para usar combo box
--
-- Observação:
-- O campo legado public.produtos.categoria será mantido
-- temporariamente por compatibilidade com as telas atuais.
-- A nova referência oficial passa a ser categoria_id.
-- =========================================================


-- =========================================================
-- 1. TABELA DE CATEGORIAS
-- =========================================================

create table if not exists public.categorias_produto (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  codigo text not null,
  nome text not null,
  ativo boolean not null default true
);

alter table public.categorias_produto
enable row level security;


-- =========================================================
-- 2. REGRAS DE QUALIDADE
-- =========================================================

alter table public.categorias_produto
drop constraint if exists categorias_produto_codigo_nao_vazio_check;

alter table public.categorias_produto
add constraint categorias_produto_codigo_nao_vazio_check
check (trim(codigo) <> '');

alter table public.categorias_produto
drop constraint if exists categorias_produto_nome_nao_vazio_check;

alter table public.categorias_produto
add constraint categorias_produto_nome_nao_vazio_check
check (trim(nome) <> '');


-- Código único ignorando maiúsculas/minúsculas e espaços laterais
create unique index if not exists ux_categorias_produto_codigo_normalizado
on public.categorias_produto (
  upper(trim(codigo))
);


-- Nome único ignorando maiúsculas/minúsculas e espaços laterais
create unique index if not exists ux_categorias_produto_nome_normalizado
on public.categorias_produto (
  lower(trim(nome))
);


-- =========================================================
-- 3. RLS - LEITURA DE CATEGORIAS ATIVAS
-- =========================================================

drop policy if exists
  "Usuarios podem consultar categorias ativas"
on public.categorias_produto;

create policy
  "Usuarios podem consultar categorias ativas"
on public.categorias_produto
for select
to anon, authenticated
using (
  ativo = true
);


-- =========================================================
-- 4. RLS - ADMIN VISUALIZA TODAS
-- =========================================================

drop policy if exists
  "Admins podem visualizar todas as categorias"
on public.categorias_produto;

create policy
  "Admins podem visualizar todas as categorias"
on public.categorias_produto
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 5. RLS - ADMIN CADASTRA
-- =========================================================

drop policy if exists
  "Admins podem cadastrar categorias"
on public.categorias_produto;

create policy
  "Admins podem cadastrar categorias"
on public.categorias_produto
for insert
to authenticated
with check (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 6. RLS - ADMIN EDITA
-- =========================================================

drop policy if exists
  "Admins podem editar categorias"
on public.categorias_produto;

create policy
  "Admins podem editar categorias"
on public.categorias_produto
for update
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 7. RLS - ADMIN EXCLUI
-- =========================================================

drop policy if exists
  "Admins podem excluir categorias"
on public.categorias_produto;

create policy
  "Admins podem excluir categorias"
on public.categorias_produto
for delete
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 8. GRANTS
-- =========================================================

grant select
on public.categorias_produto
to anon;

grant select, insert, update, delete
on public.categorias_produto
to authenticated;


-- =========================================================
-- 9. MIGRA CATEGORIAS JÁ EXISTENTES
-- =========================================================
--
-- O código é gerado a partir do nome:
-- "Kit Box"     -> KIT_BOX
-- "Acessórios"  -> ACESSORIOS
--
-- translate() remove os acentos mais comuns.
-- =========================================================

insert into public.categorias_produto (
  codigo,
  nome,
  ativo
)
select distinct
  upper(
    trim(
      both '_' from regexp_replace(
        translate(
          trim(p.categoria),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
        ),
        '[^a-zA-Z0-9]+',
        '_',
        'g'
      )
    )
  ) as codigo,
  trim(p.categoria) as nome,
  true
from public.produtos p
where p.categoria is not null
  and trim(p.categoria) <> ''
on conflict do nothing;


-- =========================================================
-- 10. ADICIONA CATEGORIA_ID EM PRODUTOS
-- =========================================================

alter table public.produtos
add column if not exists categoria_id uuid;


-- =========================================================
-- 11. RELACIONA PRODUTOS ÀS CATEGORIAS MIGRADAS
-- =========================================================

update public.produtos p
set categoria_id = c.id
from public.categorias_produto c
where p.categoria_id is null
  and p.categoria is not null
  and lower(trim(c.nome)) = lower(trim(p.categoria));


-- =========================================================
-- 12. FOREIGN KEY
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produtos_categoria_id_fkey'
      and conrelid = 'public.produtos'::regclass
  ) then
    alter table public.produtos
    add constraint produtos_categoria_id_fkey
    foreign key (categoria_id)
    references public.categorias_produto(id)
    on update cascade
    on delete restrict;
  end if;
end;
$$;


-- =========================================================
-- 13. ÍNDICE PARA CONSULTAS
-- =========================================================

create index if not exists ix_produtos_categoria_id
on public.produtos(categoria_id);


-- =========================================================
-- 14. VERIFICAÇÃO OPCIONAL
-- =========================================================
--
-- select
--   c.codigo,
--   c.nome,
--   c.ativo,
--   count(p.id) as produtos
-- from public.categorias_produto c
-- left join public.produtos p
--   on p.categoria_id = c.id
-- group by
--   c.id,
--   c.codigo,
--   c.nome,
--   c.ativo
-- order by c.nome;
--
-- =========================================================
