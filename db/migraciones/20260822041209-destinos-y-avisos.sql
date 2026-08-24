-- Los destinos de aviso van CIFRADOS: son numeros de telefono y correos
-- personales, o sea dato personal. Y ademas dicen a que hora localizar a
-- alguien, que es informacion que no tiene por que estar legible en un respaldo.
alter table public.empresas add column if not exists destinos_cifrados text;
comment on column public.empresas.destinos_cifrados is
  'Cifrado AES-256-GCM: telefonos y correos de aviso, y a donde va cada tipo de evento.';

-- Registro de lo que se avisó. Sirve para tres cosas:
--   1. Saber si un aviso salió o se atoró.
--   2. No repetir el mismo aviso veinte veces (anti-tormenta).
--   3. Poder demostrar cuando se notificó una urgencia.
create table if not exists public.avisos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('urgencia','lead','resumen')),
  canal       text not null,                 -- correo, calendario, whatsapp...
  destino     text,                          -- ya recortado, nunca el numero completo
  estado      text not null default 'enviado' check (estado in ('enviado','fallido')),
  detalle     jsonb not null default '{}'::jsonb,
  conversacion_id uuid references public.conversaciones(id) on delete set null,
  visto_at    timestamptz,                   -- cuando el medico lo marco como visto
  created_at  timestamptz not null default now()
);
create index if not exists avisos_empresa_idx on public.avisos (empresa_id, created_at desc);
create index if not exists avisos_pendientes_idx on public.avisos (empresa_id, created_at desc)
  where visto_at is null;

alter table public.avisos enable row level security;

drop policy if exists avisos_super on public.avisos;
create policy avisos_super on public.avisos for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists avisos_suyos on public.avisos;
create policy avisos_suyos on public.avisos for select to authenticated
  using (empresa_id = public.mi_empresa());

-- Marcar un aviso como visto es lo unico que puede hacer la empresa.
drop policy if exists avisos_marcar_visto on public.avisos;
create policy avisos_marcar_visto on public.avisos for update to authenticated
  using (empresa_id = public.mi_empresa()) with check (empresa_id = public.mi_empresa());
