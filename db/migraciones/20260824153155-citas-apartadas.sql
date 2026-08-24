create table if not exists public.citas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  -- Día y hora POR SEPARADO, en la hora local del negocio, y sin zona horaria.
  -- Guardar un timestamptz obligaría a saber en qué huso vive cada cliente y a
  -- convertir en los dos sentidos. Un negocio piensa «el jueves a las 5» y el
  -- bot habla igual: si nadie convierte, nadie se equivoca al convertir.
  dia         date not null,
  hora        text not null check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  -- Nombre y teléfono de quien la aparta: cifrados, como todo dato de persona.
  datos_cifrados text,
  sesion      text,
  estado      text not null default 'apartada'
              check (estado in ('apartada','confirmada','cancelada')),
  created_at  timestamptz not null default now()
);

-- Dos personas no pueden apartar el mismo hueco. Es la única garantía que
-- de verdad importa aquí, y tiene que vivir en la base: comprobarlo en el
-- código deja una rendija entre el «está libre» y el «ya lo aparté».
create unique index if not exists citas_hueco_unico
  on public.citas (empresa_id, dia, hora) where estado <> 'cancelada';

create index if not exists citas_agenda_idx on public.citas (empresa_id, dia);

alter table public.citas enable row level security;

create policy citas_super on public.citas
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

create policy citas_suyas on public.citas
  for all to authenticated
  using (empresa_id = public.mi_empresa())
  with check (empresa_id = public.mi_empresa());

comment on table public.citas is
  'Huecos apartados por el bot. Nacen como «apartada», nunca como confirmada: '
  'apartar es reversible y confirmar no, así que confirmar lo hace una persona.';
