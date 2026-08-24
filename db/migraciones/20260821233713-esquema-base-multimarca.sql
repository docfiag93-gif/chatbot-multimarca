-- CHATBOT MULTIMARCA · Esquema base (ver chatbot/db/01-esquema.sql)

create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  nombre        text not null,
  dominio       text not null default 'comercial' check (dominio in ('clinico','comercial')),
  plan          text not null default 'prueba'    check (plan in ('prueba','basico','pro')),
  activa        boolean not null default true,
  suspendida_at timestamptz,
  marca        jsonb not null default '{}'::jsonb,
  saludo       text,
  sugerencias  jsonb not null default '[]'::jsonb,
  descargo     text,
  captura      jsonb not null default '{}'::jsonb,
  persona_cifrada      text,
  conocimiento_cifrado text,
  limites_cifrados     text,
  llaves_cifradas      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.empresas is 'Un renglon por marca. Las columnas _cifrado(a/s) guardan AES-256-GCM: la base no puede leerlas.';
comment on column public.empresas.dominio is 'clinico activa las banderas rojas de urgencia. comercial no las carga.';
create index if not exists empresas_slug_idx on public.empresas (slug) where activa;

create table if not exists public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  rol        text not null default 'pendiente' check (rol in ('superadmin','dueno','staff','pendiente')),
  nombre     text,
  email      text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint usuarios_empresa_coherente check (
    (rol in ('superadmin','pendiente') and empresa_id is null) or
    (rol in ('dueno','staff')          and empresa_id is not null)
  )
);
create index if not exists usuarios_empresa_idx on public.usuarios (empresa_id);

create or replace function public.mi_empresa()
returns uuid language sql security definer stable
set search_path = public, pg_temp
as $$ select empresa_id from public.usuarios where id = auth.uid() and activo $$;

create or replace function public.es_superadmin()
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$ select coalesce((select rol from public.usuarios where id = auth.uid() and activo) = 'superadmin', false) $$;

create or replace function public.es_dueno()
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$ select coalesce((select rol from public.usuarios where id = auth.uid() and activo) in ('superadmin','dueno'), false) $$;

revoke all on function public.mi_empresa()    from public;
revoke all on function public.es_superadmin() from public;
revoke all on function public.es_dueno()      from public;
grant execute on function public.mi_empresa()    to authenticated;
grant execute on function public.es_superadmin() to authenticated;
grant execute on function public.es_dueno()      to authenticated;

create table if not exists public.conversaciones (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  sesion            text,
  mensajes_cifrados text,
  urgencia          boolean not null default false,
  motivo_urgencia   text,
  via               text,
  created_at        timestamptz not null default now()
);
create index if not exists conversaciones_empresa_idx on public.conversaciones (empresa_id, created_at desc);
create index if not exists conversaciones_urgencia_idx on public.conversaciones (empresa_id, created_at desc) where urgencia;

create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  datos_cifrados text not null,
  consintio      boolean not null,
  aviso_version  text,
  atendido       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists leads_empresa_idx on public.leads (empresa_id, created_at desc);

create table if not exists public.bitacora (
  id         bigserial primary key,
  actor      uuid,
  empresa_id uuid,
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bitacora_fecha_idx on public.bitacora (created_at desc);

alter table public.empresas       enable row level security;
alter table public.usuarios       enable row level security;
alter table public.conversaciones enable row level security;
alter table public.leads          enable row level security;
alter table public.bitacora       enable row level security;

drop policy if exists empresas_super_todo on public.empresas;
create policy empresas_super_todo on public.empresas for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());
drop policy if exists empresas_ve_la_suya on public.empresas;
create policy empresas_ve_la_suya on public.empresas for select to authenticated
  using (id = public.mi_empresa());
drop policy if exists empresas_dueno_edita on public.empresas;
create policy empresas_dueno_edita on public.empresas for update to authenticated
  using (id = public.mi_empresa() and public.es_dueno())
  with check (id = public.mi_empresa());

drop policy if exists usuarios_super_todo on public.usuarios;
create policy usuarios_super_todo on public.usuarios for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());
drop policy if exists usuarios_ve_su_equipo on public.usuarios;
create policy usuarios_ve_su_equipo on public.usuarios for select to authenticated
  using (empresa_id = public.mi_empresa());

drop policy if exists conversaciones_super on public.conversaciones;
create policy conversaciones_super on public.conversaciones for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());
drop policy if exists conversaciones_suyas on public.conversaciones;
create policy conversaciones_suyas on public.conversaciones for select to authenticated
  using (empresa_id = public.mi_empresa());

drop policy if exists leads_super on public.leads;
create policy leads_super on public.leads for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());
drop policy if exists leads_suyos on public.leads;
create policy leads_suyos on public.leads for select to authenticated
  using (empresa_id = public.mi_empresa());
drop policy if exists leads_marcar_atendido on public.leads;
create policy leads_marcar_atendido on public.leads for update to authenticated
  using (empresa_id = public.mi_empresa()) with check (empresa_id = public.mi_empresa());

drop policy if exists bitacora_super_lee on public.bitacora;
create policy bitacora_super_lee on public.bitacora for select to authenticated using (public.es_superadmin());
drop policy if exists bitacora_empresa_lee on public.bitacora;
create policy bitacora_empresa_lee on public.bitacora for select to authenticated using (empresa_id = public.mi_empresa());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.usuarios (id, email, nombre, rol, empresa_id, activo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'pendiente',
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
