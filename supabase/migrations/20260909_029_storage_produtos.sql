-- =========================================================
-- 029 - STORAGE DE IMAGENS DE PRODUTOS
-- O Box Driver - Protótipo / Sandbox
--
-- Objetivos:
-- 1. Criar/configurar bucket público "produtos"
-- 2. Permitir leitura pública das imagens
-- 3. Permitir upload/alteração/exclusão somente para usuários admin
-- 4. Restringir tipos de arquivo e tamanho máximo
--
-- Observação:
-- A tabela public.produtos já possui o campo imagem_url.
-- Esta migration não altera estoque nem cadastro de produtos.
-- =========================================================

-- =========================================================
-- 1. CRIA / ATUALIZA O BUCKET
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'produtos',
  'produtos',
  true,
  5242880, -- 5 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id)
do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- =========================================================
-- 2. LEITURA PÚBLICA DAS IMAGENS
-- =========================================================

drop policy if exists
  "Imagens de produtos sao publicas"
on storage.objects;

create policy
  "Imagens de produtos sao publicas"
on storage.objects
for select
to public
using (
  bucket_id = 'produtos'
);


-- =========================================================
-- 3. UPLOAD SOMENTE POR ADMIN
-- =========================================================

drop policy if exists
  "Admins podem enviar imagens de produtos"
on storage.objects;

create policy
  "Admins podem enviar imagens de produtos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 4. ALTERAÇÃO SOMENTE POR ADMIN
-- =========================================================

drop policy if exists
  "Admins podem alterar imagens de produtos"
on storage.objects;

create policy
  "Admins podem alterar imagens de produtos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
)
with check (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 5. EXCLUSÃO SOMENTE POR ADMIN
-- =========================================================

drop policy if exists
  "Admins podem excluir imagens de produtos"
on storage.objects;

create policy
  "Admins podem excluir imagens de produtos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produtos'
  and exists (
    select 1
    from public.perfil_cliente pc
    where pc.user_id = auth.uid()
      and pc.tipo_usuario = 'admin'
  )
);


-- =========================================================
-- 6. VERIFICAÇÃO FINAL
-- =========================================================
--
-- Após executar, você pode conferir com:
--
-- select
--   id,
--   name,
--   public,
--   file_size_limit,
--   allowed_mime_types
-- from storage.buckets
-- where id = 'produtos';
--
-- Resultado esperado:
-- id        = produtos
-- name      = produtos
-- public    = true
-- limite    = 5242880 bytes
-- formatos  = JPEG, PNG e WEBP
-- =========================================================
