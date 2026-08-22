-- ════════════════════════════════════════════════════════════════════════════
--  CHATBOT MULTIMARCA · Esquema base
--  Proyecto Supabase: chatbot-multimarca  (gnhndbqbgvtoxhelikcy)
--
--  ESTE PROYECTO ES INDEPENDIENTE. No comparte base, ni cuentas, ni tablas
--  con `nutri-isa app`. Es a propósito: aquí van a entrar empleados de
--  empresas clientes, y no deben existir siquiera en el mismo `auth.users`
--  que los médicos que ven expedientes de pacientes reales.
--
--  QUÉ ESTÁ CIFRADO Y QUÉ NO:
--    · Las columnas que terminan en `_cifrado` guardan bultos ilegibles.
--      Se cifran en la funcion del servidor (AES-256-GCM, llave derivada por
--      empresa). La base NUNCA ve la llave ni el texto claro.
--    · Lo que NO se cifra es lo que el widget muestra a cualquiera que entre
--      al sitio: colores, saludo, sugerencias. Cifrar eso solo daría trabajo
--      sin proteger nada — ya es público por definición.
--
--  RLS: todas las tablas la traen prendida y NIEGAN por omisión. El widget
--  público no toca la base directo: pasa por la función.
--
--  Es idempotente: se puede correr varias veces sin daño.
-- ════════════════════════════════════════════════════════════════════════════

-- ----------------------------------------------------------------------------
-- 1) EMPRESAS  (cada cliente que compre el chatbot; también las marcas propias)
-- ----------------------------------------------------------------------------
create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,       -- lo que va en data-marca="..."
  nombre        text not null,
  dominio       text not null default 'comercial'
                check (dominio in ('clinico','comercial')),
  plan          text not null default 'prueba'
                check (plan in ('prueba','basico','pro')),
  activa        boolean not null default true,
  suspendida_at timestamptz,

  -- ── Lo público: es lo que el widget pinta antes de que nadie escriba nada.
  marca        jsonb not null default '{}'::jsonb,   -- colores y avatar
  saludo       text,
  sugerencias  jsonb not null default '[]'::jsonb,
  descargo     text,
  captura      jsonb not null default '{}'::jsonb,

  -- ── Lo cifrado: secreto comercial de la empresa y sus llaves.
  --    Son `text` porque guardan 'v1.<iv>.<datos>' en base64.
  persona_cifrada      text,
  conocimiento_cifrado text,
  limites_cifrados     text,
  llaves_cifradas      text,   -- si la empresa trae su propia API key

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.empresas is
  'Un renglón por marca. Las columnas _cifrado(a/s) guardan AES-256-GCM: la base no puede leerlas.';
comment on column public.empresas.dominio is
  'clinico activa las banderas rojas de urgencia. comercial no las carga.';

create index if not exists empresas_slug_idx on public.empresas (slug) where activa;

-- ----------------------------------------------------------------------------
-- 2) USUARIOS  (1 renglón por cuenta de auth.users)
--    El rol vive AQUÍ, en la base. Nunca se decide en el navegador: un rol
--    que se decide en el cliente lo cambia cualquiera con la consola abierta.
-- ----------------------------------------------------------------------------
create table if not exists public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  rol        text not null default 'pendiente'
             check (rol in ('superadmin','dueno','staff','pendiente')),
  nombre     text,
  email      text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),

  -- Quién puede andar suelto sin empresa:
  --   · 'superadmin' — eres tú, la plataforma. No perteneces a un cliente.
  --   · 'pendiente'  — acaba de registrarse y nadie lo ha asignado todavía.
  -- 'dueno' y 'staff' SIEMPRE tienen empresa: una cuenta con permisos y sin
  -- dueño de los datos es justo por donde se filtra la información.
  --
  -- OJO: esta restricción y el disparador de alta se contradecían en la
  -- primera versión (el disparador creaba 'staff' sin empresa y la
  -- restricción lo rechazaba, así que NADIE podía registrarse). Por eso
  -- existe 'pendiente'.
  constraint usuarios_empresa_coherente check (
    (rol in ('superadmin','pendiente') and empresa_id is null) or
    (rol in ('dueno','staff')          and empresa_id is not null)
  )
);
create index if not exists usuarios_empresa_idx on public.usuarios (empresa_id);

-- ----------------------------------------------------------------------------
-- 3) LAS FUNCIONES LLAVE
--    SECURITY DEFINER + search_path fijo = blindadas contra escalada.
--    Al ser DEFINER leen `usuarios` sin pasar por RLS, y así no hay recursión
--    (una política que consulta la tabla que la política protege se cicla).
-- ----------------------------------------------------------------------------
create or replace function public.mi_empresa()
returns uuid language sql security definer stable
set search_path = public, pg_temp
as $$ select empresa_id from public.usuarios where id = auth.uid() and activo $$;

create or replace function public.es_superadmin()
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$
  select coalesce((select rol from public.usuarios where id = auth.uid() and activo) = 'superadmin', false)
$$;

create or replace function public.es_dueno()
returns boolean language sql security definer stable
set search_path = public, pg_temp
as $$
  select coalesce((select rol from public.usuarios where id = auth.uid() and activo) in ('superadmin','dueno'), false)
$$;

revoke all on function public.mi_empresa()    from public;
revoke all on function public.es_superadmin() from public;
revoke all on function public.es_dueno()      from public;
grant execute on function public.mi_empresa()    to authenticated;
grant execute on function public.es_superadmin() to authenticated;
grant execute on function public.es_dueno()      to authenticated;

-- ----------------------------------------------------------------------------
-- 4) CONVERSACIONES
--    El texto va cifrado entero. Lo que queda en claro es solo lo que hace
--    falta para contar y para alertar: si hubo urgencia y de qué tipo.
--    El MOTIVO es la categoría clínica ('dolor torácico'), NUNCA la frase que
--    escribió la persona.
-- ----------------------------------------------------------------------------
create table if not exists public.conversaciones (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  sesion            text,        -- id anónimo del navegador, no identifica a nadie
  mensajes_cifrados text,
  urgencia          boolean not null default false,
  motivo_urgencia   text,
  via               text,        -- qué proveedor contestó (claude/gemini/...)
  created_at        timestamptz not null default now()
);
create index if not exists conversaciones_empresa_idx on public.conversaciones (empresa_id, created_at desc);
create index if not exists conversaciones_urgencia_idx on public.conversaciones (empresa_id, created_at desc) where urgencia;

-- ----------------------------------------------------------------------------
-- 5) LEADS  (quien dejó sus datos para que le llamen)
--    Nombre, teléfono y motivo van cifrados JUNTOS en un solo bulto: si se
--    guardaran en columnas separadas, un respaldo filtrado ya diría cuántos
--    hay y de qué empresa aunque no se leyera el contenido.
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  datos_cifrados text not null,
  consintio      boolean not null,          -- marcó el aviso de privacidad
  aviso_version  text,                      -- qué versión del aviso aceptó
  atendido       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists leads_empresa_idx on public.leads (empresa_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 6) BITÁCORA  (quién vio o cambió qué)
--    Sirve para dos cosas: saber si alguien anduvo donde no debía, y poder
--    demostrarlo. Nadie puede borrar ni editar renglones — solo insertar.
-- ----------------------------------------------------------------------------
create table if not exists public.bitacora (
  id         bigserial primary key,
  actor      uuid,
  empresa_id uuid,
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bitacora_fecha_idx on public.bitacora (created_at desc);

-- ----------------------------------------------------------------------------
-- 7) RLS — todo prendido, todo niega por omisión
--    El widget publico NO entra aqui: habla con la funcion del servidor, que es
--    la única que tiene la llave de servicio. Por eso `anon` no recibe ningún
--    permiso en ninguna tabla.
-- ----------------------------------------------------------------------------
alter table public.empresas       enable row level security;
alter table public.usuarios       enable row level security;
alter table public.conversaciones enable row level security;
alter table public.leads          enable row level security;
alter table public.bitacora       enable row level security;

-- EMPRESAS
drop policy if exists empresas_super_todo on public.empresas;
create policy empresas_super_todo on public.empresas
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists empresas_ve_la_suya on public.empresas;
create policy empresas_ve_la_suya on public.empresas
  for select to authenticated
  using (id = public.mi_empresa());

-- Solo el dueño edita su empresa; el staff mira. Y NADIE que no sea
-- superadmin puede cambiarse el plan o revivirse una cuenta suspendida:
-- eso se controla en la función, no aquí, para no complicar la política.
drop policy if exists empresas_dueno_edita on public.empresas;
create policy empresas_dueno_edita on public.empresas
  for update to authenticated
  using (id = public.mi_empresa() and public.es_dueno())
  with check (id = public.mi_empresa());

-- USUARIOS
drop policy if exists usuarios_super_todo on public.usuarios;
create policy usuarios_super_todo on public.usuarios
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists usuarios_ve_su_equipo on public.usuarios;
create policy usuarios_ve_su_equipo on public.usuarios
  for select to authenticated
  using (empresa_id = public.mi_empresa());

-- CONVERSACIONES / LEADS  — cada quien lo suyo
drop policy if exists conversaciones_super on public.conversaciones;
create policy conversaciones_super on public.conversaciones
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists conversaciones_suyas on public.conversaciones;
create policy conversaciones_suyas on public.conversaciones
  for select to authenticated
  using (empresa_id = public.mi_empresa());

drop policy if exists leads_super on public.leads;
create policy leads_super on public.leads
  for all to authenticated
  using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists leads_suyos on public.leads;
create policy leads_suyos on public.leads
  for select to authenticated
  using (empresa_id = public.mi_empresa());

drop policy if exists leads_marcar_atendido on public.leads;
create policy leads_marcar_atendido on public.leads
  for update to authenticated
  using (empresa_id = public.mi_empresa())
  with check (empresa_id = public.mi_empresa());

-- BITÁCORA — se lee, no se toca. Ni el superadmin la edita.
drop policy if exists bitacora_super_lee on public.bitacora;
create policy bitacora_super_lee on public.bitacora
  for select to authenticated using (public.es_superadmin());

drop policy if exists bitacora_empresa_lee on public.bitacora;
create policy bitacora_empresa_lee on public.bitacora
  for select to authenticated using (empresa_id = public.mi_empresa());

-- ----------------------------------------------------------------------------
-- 8) ALTA AUTOMÁTICA DE PERFIL
--    Nace SIN empresa y SIN rol utilizable: una cuenta nueva no puede ver nada
--    hasta que el superadmin la asigne. Lo contrario —que cualquiera que se
--    registre entre a algo— es como se filtran los datos entre clientes.
-- ----------------------------------------------------------------------------
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
    false          -- inactivo hasta que el superadmin lo asigne a una empresa
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Si algo truena aquí, NO se puede abortar el registro: dejaría a la
  -- persona sin poder crear cuenta. Se deja pasar y se revisa después.
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 9) CIERRE DE PERMISOS SOBRE LAS FUNCIONES
--
--    Hace falta AUNQUE arriba ya se hizo "revoke ... from public": Supabase
--    tiene privilegios por omisión que otorgan EXECUTE a `anon` y a
--    `authenticated` sobre toda función nueva. El revoke a PUBLIC no los
--    quita, porque son concesiones directas a esos roles. Hay que nombrarlos.
--
--    Lo detectó el analizador de seguridad de Supabase, no yo. La que
--    importaba: handle_new_user() es una función de DISPARADOR y quedó
--    publicada en /rest/v1/rpc/handle_new_user, invocable por cualquiera sin
--    cuenta. No debe poder llamarla nadie desde la API.
-- ----------------------------------------------------------------------------
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Estas tres se le dejan a `authenticated` y NO es opcional: las políticas de
-- RLS las invocan, y una política solo puede llamar una función que el rol que
-- consulta tenga permiso de ejecutar. Si se revocan, las políticas dejan de
-- evaluar y el panel se queda ciego.
--
-- El analizador las va a seguir marcando como aviso. Es esperado: solo
-- devuelven datos de la sesión de quien pregunta, así que no filtran nada.
revoke all on function public.mi_empresa()    from anon;
revoke all on function public.es_superadmin() from anon;
revoke all on function public.es_dueno()      from anon;

grant execute on function public.mi_empresa()    to authenticated;
grant execute on function public.es_superadmin() to authenticated;
grant execute on function public.es_dueno()      to authenticated;

-- ----------------------------------------------------------------------------
-- 10) DE DOS SECTORES FIJOS A CUALQUIER NEGOCIO
--     (aplicada como migracion `negocio_generico_sin_sector`)
--
--     El esquema de arriba tenia esto:
--         dominio text check (dominio in ('clinico','comercial'))
--
--     O sea: la BASE DE DATOS decidia que solo existian dos tipos de negocio.
--     Dar de alta una tienda, un taller o una inmobiliaria obligaba a cambiar
--     el esquema y volver a desplegar. Eso no es un producto multiempresa.
-- ----------------------------------------------------------------------------
alter table public.empresas add column if not exists categoria text not null default '';
alter table public.empresas add column if not exists politicas jsonb not null default '[]'::jsonb;
alter table public.empresas add column if not exists acciones  jsonb not null default '[]'::jsonb;
alter table public.empresas add column if not exists perfil_cifrado text;
alter table public.empresas add column if not exists ejemplo boolean not null default false;
alter table public.empresas add column if not exists estado text not null default 'borrador';

comment on column public.empresas.categoria is
  'Texto LIBRE. Cualquier rubro. No hay lista cerrada y no debe agregarse una.';
comment on column public.empresas.politicas is
  'Modulos opt-in (ej. urgencias-clinicas). Vacio por omision: ninguna regla se enciende sola.';
comment on column public.empresas.acciones is
  'Que puede hacer el bot: mostrar_catalogo, cotizar, reservar, agendar, capturar_contacto...';
comment on column public.empresas.perfil_cifrado is
  'Cifrado: catalogo, horarios, ubicaciones, objetivos y atributos personalizados.';
comment on column public.empresas.ejemplo is
  'true = semilla de demostracion, borrable en bloque. Nunca para un cliente real.';

-- EL cambio de esta migracion: se quita la restriccion de dos sectores.
alter table public.empresas drop constraint if exists empresas_dominio_check;
alter table public.empresas alter column dominio drop not null;
alter table public.empresas alter column dominio set default null;
comment on column public.empresas.dominio is
  'OBSOLETO. Se conserva para no perder datos de filas viejas. Usa categoria y politicas.';

-- Compatibilidad: el dominio viejo se vuelve categoria legible, y SOLO lo que
-- estaba marcado como clinico conserva su politica. Ningun otro la hereda.
update public.empresas
   set categoria = case
         when categoria <> '' then categoria
         when dominio = 'clinico'   then 'Salud y bienestar'
         when dominio = 'comercial' then 'Comercio y tienda'
         else '' end,
       politicas = case
         when politicas <> '[]'::jsonb then politicas
         when dominio = 'clinico' then '["urgencias-clinicas"]'::jsonb
         else '[]'::jsonb end,
       estado = case when activa then 'publicado' else 'suspendido' end;

alter table public.empresas drop constraint if exists empresas_estado_check;
alter table public.empresas add constraint empresas_estado_check
  check (estado in ('borrador','publicado','suspendido'));

create index if not exists empresas_categoria_idx on public.empresas (categoria) where activa;
create index if not exists empresas_ejemplo_idx on public.empresas (ejemplo);
