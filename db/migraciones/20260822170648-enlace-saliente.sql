-- El enlace saliente: a donde el bot le avisa al sistema del negocio cuando
-- alguien deja sus datos, pide una cita o se detecta una urgencia.
--
-- Va cifrado porque lleva un SECRETO compartido. Ese secreto es lo unico que
-- impide que cualquiera que descubra la URL invente citas en el sistema del
-- cliente. Guardarlo en claro seria dejarlo al lado de lo que protege.
alter table public.empresas add column if not exists enlace_cifrado text;
comment on column public.empresas.enlace_cifrado is
  'Cifrado: { url, secreto, eventos[] } del sistema al que el bot avisa. El secreto firma cada envio.';

-- Registro de lo que se envio, para poder depurar una integracion sin abrir
-- los datos del cliente: se guarda el resultado, nunca el contenido.
create table if not exists public.envios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  evento      text not null,
  estado      integer,
  ok          boolean not null default false,
  motivo      text,
  intentos    smallint not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists envios_empresa_idx on public.envios (empresa_id, created_at desc);
create index if not exists envios_fallidos_idx on public.envios (empresa_id, created_at desc) where not ok;

alter table public.envios enable row level security;

drop policy if exists envios_super on public.envios;
create policy envios_super on public.envios for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists envios_suyos on public.envios;
create policy envios_suyos on public.envios for select to authenticated
  using (empresa_id = public.mi_empresa());
