create table if not exists public.reportes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas(id) on delete set null,
  autor       uuid not null references public.usuarios(id) on delete cascade,
  asunto      text not null,
  tipo        text not null default 'falla' check (tipo in ('falla','queja','idea','otro')),
  estado      text not null default 'abierto' check (estado in ('abierto','en_proceso','resuelto')),
  hilo_cifrado text,
  ultimo_de   text not null default 'usuario' check (ultimo_de in ('usuario','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reportes_autor_idx   on public.reportes (autor);
create index if not exists reportes_estado_idx  on public.reportes (estado);
create index if not exists reportes_empresa_idx on public.reportes (empresa_id);
alter table public.reportes enable row level security;
create policy reportes_super on public.reportes
  for all to authenticated using (public.es_superadmin()) with check (public.es_superadmin());
create policy reportes_los_mios on public.reportes
  for select to authenticated using (autor = auth.uid());
create policy reportes_abrir on public.reportes
  for insert to authenticated with check (autor = auth.uid());
create policy reportes_responder on public.reportes
  for update to authenticated using (autor = auth.uid()) with check (autor = auth.uid());
