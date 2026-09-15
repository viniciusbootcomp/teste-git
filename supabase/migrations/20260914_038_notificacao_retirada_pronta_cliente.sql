-- =========================================================
-- 038 - NOTIFICAÇÃO AUTOMÁTICA: RETIRADA PRONTA -> CLIENTE
-- O Box Driver - Homologação / Fase 1
-- =========================================================

create unique index if not exists
  ux_notificacoes_retirada_pronta_cliente
on public.notificacoes (
  tipo,
  retirada_id,
  user_id
)
where
  tipo = 'retirada_pronta'
  and retirada_id is not null
  and user_id is not null;

create or replace function public.notificar_cliente_retirada_pronta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_user_id uuid;
  v_numero_pedido bigint;
begin
  if new.status = 'pronto_retirada'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'pronto_retirada'
       or old.pedido_id is distinct from new.pedido_id
     )
  then
    select
      p.user_id,
      p.numero_pedido
    into
      v_cliente_user_id,
      v_numero_pedido
    from public.pedidos p
    where p.id = new.pedido_id;

    if v_cliente_user_id is null
       or v_numero_pedido is null
    then
      return new;
    end if;

    insert into public.notificacoes (
      titulo,
      mensagem,
      tipo,
      user_id,
      pedido_id,
      retirada_id,
      link,
      lida,
      lida_em,
      criada_por_user_id
    )
    values (
      'Retirada pronta',
      'A retirada ' || new.sequencia::text ||
      ' do pedido #' || v_numero_pedido::text ||
      ' está pronta para retirada. Seu QR Code já está disponível.',
      'retirada_pronta',
      v_cliente_user_id,
      new.pedido_id,
      new.id,
      '/pedido/' || v_numero_pedido::text,
      false,
      null,
      null
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists
  trg_notificar_cliente_retirada_pronta
on public.retiradas_pedido;

create trigger trg_notificar_cliente_retirada_pronta
after insert or update of status, pedido_id
on public.retiradas_pedido
for each row
execute function public.notificar_cliente_retirada_pronta();

comment on function public.notificar_cliente_retirada_pronta()
is
'Cria uma notificação individual para o cliente quando uma retirada entra em pronto_retirada.';

-- Verificação opcional:
--
-- select
--   id,
--   titulo,
--   mensagem,
--   tipo,
--   user_id,
--   pedido_id,
--   retirada_id,
--   link,
--   created_at
-- from public.notificacoes
-- where tipo = 'retirada_pronta'
-- order by created_at desc;
