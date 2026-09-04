-- =========================================================
-- RLS para operação interna de retiradas
-- =========================================================

grant select
on public.retiradas_pedido
to authenticated;

grant select
on public.itens_retirada
to authenticated;


create policy "Admin pode consultar retiradas"
on public.retiradas_pedido
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente
    where perfil_cliente.user_id = auth.uid()
      and perfil_cliente.tipo_usuario = 'admin'
  )
);


create policy "Admin pode consultar itens das retiradas"
on public.itens_retirada
for select
to authenticated
using (
  exists (
    select 1
    from public.perfil_cliente
    where perfil_cliente.user_id = auth.uid()
      and perfil_cliente.tipo_usuario = 'admin'
  )
);