-- ════════════════════════════════════════════════════════════════════════
--  De dos sectores fijos a cualquier negocio
--
--  El esquema anterior tenia esto:
--      dominio text check (dominio in ('clinico','comercial'))
--
--  O sea: la BASE DE DATOS decidia que solo existian dos tipos de negocio en
--  el mundo. Dar de alta una tienda, un taller o una inmobiliaria obligaba a
--  cambiar el esquema y volver a desplegar. Eso no es multiempresa.
--
--  Ahora:
--    categoria  -> TEXTO LIBRE, sin restriccion. "Otro" incluido.
--    politicas  -> modulos que se encienden a proposito. Vacio por omision.
--    acciones   -> que puede hacer el bot en ese negocio.
--    perfil_cifrado -> catalogo, horarios, ubicaciones y atributos propios.
--
--  `dominio` se conserva por compatibilidad con las filas que ya existan,
--  pero deja de tener restriccion y deja de decidir nada.
-- ════════════════════════════════════════════════════════════════════════

alter table public.empresas add column if not exists categoria text not null default '';
alter table public.empresas add column if not exists politicas jsonb not null default '[]'::jsonb;
alter table public.empresas add column if not exists acciones  jsonb not null default '[]'::jsonb;
alter table public.empresas add column if not exists perfil_cifrado text;
alter table public.empresas add column if not exists ejemplo boolean not null default false;
alter table public.empresas add column if not exists estado text not null default 'borrador';

comment on column public.empresas.categoria is
  'Texto LIBRE. Cualquier rubro. No hay lista cerrada y no debe agregarse una.';
comment on column public.empresas.politicas is
  'Modulos opt-in (ej. urgencias-clinicas). Vacio por omision: ninguna regla especial se enciende sola.';
comment on column public.empresas.acciones is
  'Que puede hacer el bot: mostrar_catalogo, cotizar, reservar, agendar, capturar_contacto...';
comment on column public.empresas.perfil_cifrado is
  'Cifrado AES-256-GCM: catalogo, horarios, ubicaciones, objetivos y atributos personalizados.';
comment on column public.empresas.ejemplo is
  'true = semilla de demostracion, borrable en bloque. Nunca para un cliente real.';

-- Quitar la restriccion de dos sectores. Es EL cambio de esta migracion.
alter table public.empresas drop constraint if exists empresas_dominio_check;
alter table public.empresas alter column dominio drop not null;
alter table public.empresas alter column dominio set default null;
comment on column public.empresas.dominio is
  'OBSOLETO. Se conserva solo para no perder datos de filas viejas. Usa `categoria` y `politicas`.';

-- Migrar lo que ya existiera: el dominio viejo se convierte en categoria
-- legible, y solo lo marcado como clinico conserva su politica.
update public.empresas
   set categoria = case
         when categoria <> '' then categoria
         when dominio = 'clinico'   then 'Salud y bienestar'
         when dominio = 'comercial' then 'Comercio y tienda'
         else ''
       end,
       politicas = case
         when politicas <> '[]'::jsonb then politicas
         when dominio = 'clinico' then '["urgencias-clinicas"]'::jsonb
         else '[]'::jsonb
       end,
       estado = case when activa then 'publicado' else 'suspendido' end;

-- El estado ahora tiene tres valores: borrador sirve para guardar a medias
-- desde el asistente de alta sin publicar nada.
alter table public.empresas drop constraint if exists empresas_estado_check;
alter table public.empresas add constraint empresas_estado_check
  check (estado in ('borrador','publicado','suspendido'));

create index if not exists empresas_categoria_idx on public.empresas (categoria) where activa;
create index if not exists empresas_ejemplo_idx on public.empresas (ejemplo);
