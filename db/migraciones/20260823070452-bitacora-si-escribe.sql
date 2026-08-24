-- La bitácora tenía DOS políticas de lectura y NINGUNA de escritura. Cada
-- intento de anotar era rechazado por RLS, y el `catch` silencioso del
-- cliente se lo tragaba. Resultado: una bitácora vacía que se presentaba
-- como garantía de que todo queda registrado.
--
-- Se inserta a nombre propio y nada más: nadie puede anotar en nombre de
-- otro. Y sigue sin haber UPDATE ni DELETE — es un libro al que solo se le
-- agregan renglones, tampoco el superadmin los borra.
create policy bitacora_anota on public.bitacora
  for insert to authenticated
  with check (actor = auth.uid());

comment on table public.bitacora is
  'Registro de quién vio o cambió qué. Solo INSERT: no hay política de UPDATE '
  'ni DELETE a propósito, ni para el superadmin. Si algún día hay que borrar '
  'por retención, que sea un trabajo explícito y no un permiso permanente.';
