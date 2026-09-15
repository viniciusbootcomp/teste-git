-- =========================================================
-- 037 - LEITURA INDIVIDUAL DE NOTIFICAÇÕES
-- O Box Driver - Homologação / Fase 1
-- =========================================================

create table if not exists public.notificacoes_leitura (
  notificacao_id uuid not null,
  user_id uuid not null default auth.uid(),
  lida_em timestamptz not null default now(),

  constraint notificacoes_leitura_pkey
    primary key (notificacao_id, user_id),

  constraint notificacoes_leitura_notificacao_id_fkey
    foreign key (notificacao_id)
    references public.notificacoes(id)
    on delete cascade,

  constraint notificacoes_leitura_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete cascade
);

create index if not exists
  ix_notificacoes_leitura_user_id
on public.notificacoes_leitura(user_id);

create index if not exists
  ix_notificacoes_leitura_lida_em
on public.notificacoes_leitura(lida_em desc);

insert into public.notificacoes_leitura (
  notificacao_id,
  user_id,
  lida_em
)
select
  n.id,
  n.user_id,
  coalesce(n.lida_em, n.created_at, now())
from public.notificacoes n
where n.user_id is not null
  and n.lida = true
on conflict (notificacao_id, user_id) do nothing;

alter table public.notificacoes_leitura
enable row level security;

drop policy if exists
  notificacoes_leitura_select_propria
on public.notificacoes_leitura;

create policy notificacoes_leitura_select_propria
on public.notificacoes_leitura
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists
  notificacoes_leitura_insert_propria
on public.notificacoes_leitura;

create policy notificacoes_leitura_insert_propria
on public.notificacoes_leitura
for insert
to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists
  notificacoes_leitura_update_propria
on public.notificacoes_leitura;

create policy notificacoes_leitura_update_propria
on public.notificacoes_leitura
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

drop policy if exists
  notificacoes_leitura_delete_propria
on public.notificacoes_leitura;

create policy notificacoes_leitura_delete_propria
on public.notificacoes_leitura
for delete
to authenticated
using (
  user_id = auth.uid()
);

grant select, insert, update, delete
on public.notificacoes_leitura
to authenticated;

grant select, insert, update, delete
on public.notificacoes_leitura
to service_role;

revoke update
on public.notificacoes
from authenticated;

grant select
on public.notificacoes
to authenticated;

create or replace function public.marcar_notificacao_lida(
  p_notificacao_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.notificacoes n
    where n.id = p_notificacao_id
  ) then
    raise exception 'Notificação não encontrada ou sem acesso.';
  end if;

  insert into public.notificacoes_leitura (
    notificacao_id,
    user_id,
    lida_em
  )
  values (
    p_notificacao_id,
    auth.uid(),
    now()
  )
  on conflict (notificacao_id, user_id)
  do update
  set lida_em = excluded.lida_em;
end;
$$;

grant execute
on function public.marcar_notificacao_lida(uuid)
to authenticated;

create or replace function public.marcar_todas_notificacoes_lidas()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.notificacoes_leitura (
    notificacao_id,
    user_id,
    lida_em
  )
  select
    n.id,
    auth.uid(),
    now()
  from public.notificacoes n
  on conflict (notificacao_id, user_id)
  do update
  set lida_em = excluded.lida_em;
end;
$$;

grant execute
on function public.marcar_todas_notificacoes_lidas()
to authenticated;

-- Campos antigos lida/lida_em permanecem temporariamente
-- em public.notificacoes para compatibilidade durante a transição.
