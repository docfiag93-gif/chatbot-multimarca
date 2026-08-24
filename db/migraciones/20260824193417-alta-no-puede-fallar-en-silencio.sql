-- ════════════════════════════════════════════════════════════════════════
--  Que el alta de una cuenta no pueda fallar en silencio
--
--  `handle_new_user` traía `exception when others then return new`. Es decir:
--  si por lo que fuera el perfil no se lograba crear, la cuenta nacía en el
--  sistema de acceso SIN perfil, la persona no podía entrar nunca, y no
--  quedaba rastro de por qué. El mismo patrón que ya escondió tres fallas
--  aquí: la bitácora vacía, los avisos que no se enviaban, y el tipo de
--  aviso rechazado por una restricción.
--
--  Se conserva el `return new` — tumbar el registro de alguien porque falló
--  una tabla secundaria sería peor. Lo que cambia es que ahora DEJA RASTRO,
--  con el motivo exacto, donde el superadmin ya mira.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
  -- El registro sigue adelante, pero queda escrito qué se rompió. Si esto
  -- también falla, ya no hay nada más que hacer y no vale tumbar el alta.
  begin
    insert into public.bitacora (actor, empresa_id, accion, detalle)
    values (new.id, null, 'alta.perfil_fallo',
            jsonb_build_object(
              'correo', new.email,
              'error',  sqlerrm,
              'codigo', sqlstate,
              'nota',   'La cuenta existe pero se quedó sin perfil: no va a poder entrar. Hay que crearle el renglón en usuarios a mano.'));
  exception when others then
    null;
  end;
  return new;
end
$$;
