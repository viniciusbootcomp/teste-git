-- =========================================================
-- Leitura pública/autenticada de unidades e pontos ativos
-- =========================================================

grant select
on public.unidades
to authenticated;

grant select
on public.pontos_retirada
to authenticated;


drop policy if exists
"Usuarios autenticados podem consultar unidades ativas"
on public.unidades;

create policy
"Usuarios autenticados podem consultar unidades ativas"
on public.unidades
for select
to authenticated
using (
  ativo = true
);


drop policy if exists
"Usuarios autenticados podem consultar pontos ativos"
on public.pontos_retirada;

create policy
"Usuarios autenticados podem consultar pontos ativos"
on public.pontos_retirada
for select
to authenticated
using (
  ativo = true
);