-- ════════════════════════════════════════════════════════════════════════
--  Un tope de mensajes por negocio y por día
--
--  El freno que había era por dirección IP y vivía en la memoria de la
--  función. Dos problemas, y el segundo es el grave:
--
--    1. Cloudflare levanta muchas copias de la función en distintos lugares
--       del mundo, cada una con su propia memoria. El freno frenaba por copia,
--       no en total. Era un tope de cortesía.
--
--    2. Por IP no protege de nada aquí: los clientes de un negocio llegan
--       cada uno desde su casa. Un solo consultorio ocupado podía consumir
--       toda la cuota de IA y dejar a los demás con un bot mudo, sin que
--       nadie supiera por qué. Ese es el modo en que se rompen los productos
--       que EMPIEZAN A FUNCIONAR.
--
--  El conteo vive en la base porque es lo único que todas las copias
--  comparten, y se incrementa de forma atómica: dos mensajes simultáneos
--  suman dos, no uno.
--
--  ── SOBRE EL DÍA ──
--  Se usa la fecha en hora de Ciudad de México, no UTC. En UTC el contador
--  se reiniciaría a las 6 de la tarde hora local, a media jornada, que es
--  justo cuando un consultorio está más ocupado. Cuando haya clientes fuera
--  de este huso habrá que guardar la zona por negocio; mientras tanto, esto
--  es correcto para todos los que hay y es un cambio de una línea.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.consumo (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  dia        date not null,
  mensajes   integer not null default 0,
  primary key (empresa_id, dia)
);

comment on table public.consumo is
  'Cuántos mensajes contestó el bot de cada negocio cada día. Es lo que hace '
  'que el plan signifique algo y que un cliente no se coma la cuota de otro.';

alter table public.consumo enable row level security;

-- El dueño ve SU consumo: es su factura, tiene derecho a mirarla.
-- Nadie escribe desde el panel: el único que suma es el bot, con la llave de
-- servicio, y lo hace por la función de abajo.
create policy consumo_super on public.consumo for select to authenticated
  using (public.es_superadmin());
create policy consumo_suyo on public.consumo for select to authenticated
  using (empresa_id = public.mi_empresa());

-- Suma uno y devuelve el total del día, en una sola operación. Contarlo en
-- dos pasos (leer y luego escribir) deja una rendija por la que se cuelan
-- los mensajes simultáneos, y el tope se pasaría de largo justo cuando más
-- tráfico hay — que es cuando el tope existe.
create or replace function public.apuntar_mensaje(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  total integer;
begin
  insert into public.consumo (empresa_id, dia, mensajes)
  values (p_empresa, hoy, 1)
  on conflict (empresa_id, dia)
  do update set mensajes = public.consumo.mensajes + 1
  returning mensajes into total;
  return total;
end
$$;

-- Solo la llave de servicio la usa. Nadie con sesión debe poder inflar su
-- propio contador ni el de otro.
revoke all on function public.apuntar_mensaje(uuid) from public, anon, authenticated;

-- Un tope propio para este negocio. Nulo = el que le toque por su plan.
-- Existe para poder decirle que sí a un cliente grande sin cambiarle el plan
-- ni tocar el código.
alter table public.empresas add column if not exists tope_diario integer;
comment on column public.empresas.tope_diario is
  'Tope de mensajes al día para ESTE negocio. Nulo = el del plan. Sirve para '
  'darle más a un cliente concreto sin inventar un plan nuevo.';

-- El aviso de que se llegó al tope necesita su tipo. La lista es cerrada:
-- sin esto la base rechazaría el aviso y el dueño se quedaría sin enterarse
-- justo del problema que le está costando clientes.
alter table public.avisos drop constraint if exists avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check
  check (tipo in ('urgencia','lead','cita','resumen','tope'));
