-- ════════════════════════════════════════════════════════════════════════
--  El día del tope, en la hora del negocio
--
--  La migración anterior dejó Ciudad de México escrito a la fuerza, con la
--  nota de que «cuando haya clientes en otro huso» habría que guardar la
--  zona por negocio. Resulta que `zonaHoraria` YA existía en el perfil
--  —normalizado, con ese mismo valor por omisión— y simplemente no se
--  guardaba ni se usaba. O sea que el «cuando haya» era ya.
--
--  Se recibe como argumento en vez de leerlo de la tabla: la zona vive en el
--  bulto cifrado del perfil y la base no puede leer eso. Quien llama ya lo
--  tiene descifrado en la mano.
--
--  Una zona inválida NO tumba el conteo: se cae a Ciudad de México. Un
--  negocio con un dedazo en su huso debe seguir contando, no quedarse sin
--  bot por un error de Postgres.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.apuntar_mensaje(p_empresa uuid, p_zona text default 'America/Mexico_City')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zona  text := coalesce(nullif(trim(p_zona), ''), 'America/Mexico_City');
  hoy   date;
  total integer;
begin
  begin
    hoy := (now() at time zone zona)::date;
  exception when others then
    hoy := (now() at time zone 'America/Mexico_City')::date;
  end;

  insert into public.consumo (empresa_id, dia, mensajes)
  values (p_empresa, hoy, 1)
  on conflict (empresa_id, dia)
  do update set mensajes = public.consumo.mensajes + 1
  returning mensajes into total;
  return total;
end
$$;

revoke all on function public.apuntar_mensaje(uuid, text) from public, anon, authenticated;

-- La firma vieja de UN argumento se quita. Dejarla convivir con esta fue un
-- error: una llamada con un solo argumento ya no sabía a cuál ir, y Postgres
-- la rechazaba por ambigua. El intento era no perder cuentas durante el
-- despliegue y salía al revés — cada mensaje de las copias viejas habría dado
-- error. La de dos argumentos con valor por omisión cubre las dos formas.
drop function if exists public.apuntar_mensaje(uuid);
