-- ════════════════════════════════════════════════════════════════════════
--  BUZÓN DE SOPORTE  ·  correr una sola vez, después de 01-esquema.sql
--
--  Un hilo por reporte. No son dos tablas —reporte y mensajes— a propósito:
--  una conversación de soporte se lee entera o no se lee, nunca se pagina, y
--  partirla obligaría a una consulta con join en cada carga para no ganar
--  nada. Los mensajes viven en una sola columna cifrada.
--
--  POR QUÉ CIFRADO: quien reporta una falla escribe lo que estaba haciendo,
--  y eso arrastra nombres de pacientes, teléfonos y a veces el motivo de una
--  consulta. Un buzón de quejas en claro termina siendo el lugar menos
--  cuidado donde viven los datos más delicados.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.reportes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas(id) on delete set null,
  autor       uuid not null references public.usuarios(id) on delete cascade,
  asunto      text not null,
  tipo        text not null default 'falla'
              check (tipo in ('falla','queja','idea','otro')),
  estado      text not null default 'abierto'
              check (estado in ('abierto','en_proceso','resuelto')),
  -- [{ de:'usuario'|'admin', texto:'…', en:'ISO' }]
  hilo_cifrado text,
  -- Para que la lista sepa si hay algo sin leer sin abrir el hilo.
  ultimo_de   text not null default 'usuario' check (ultimo_de in ('usuario','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists reportes_autor_idx   on public.reportes (autor);
create index if not exists reportes_estado_idx  on public.reportes (estado);
create index if not exists reportes_empresa_idx on public.reportes (empresa_id);

alter table public.reportes enable row level security;

-- El superadmin ve y responde todo: es quien da el soporte.
create policy reportes_super on public.reportes
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

-- Cada quien ve SOLO los suyos. No los de su empresa: si un empleado se
-- queja de cómo lo trata su jefe, el jefe no debería poder leerlo desde el
-- mismo panel donde administra su negocio.
create policy reportes_los_mios on public.reportes
  for select to authenticated
  using (autor = auth.uid());

-- Y solo puede abrir hilos a su propio nombre.
create policy reportes_abrir on public.reportes
  for insert to authenticated
  with check (autor = auth.uid());

-- Responder en su propio hilo. El estado lo mueve el superadmin: quien
-- reporta no debería poder marcar como resuelto lo que sigue roto.
create policy reportes_responder on public.reportes
  for update to authenticated
  using (autor = auth.uid()) with check (autor = auth.uid());
