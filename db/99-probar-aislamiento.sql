-- ════════════════════════════════════════════════════════════════════════════
--  ¿SIGUEN SEPARADOS LOS NEGOCIOS?
--
--  El producto se vende con una promesa: el negocio de un colega no puede ver
--  nada del negocio de otro. Esto la comprueba. No la razona: la comprueba.
--
--  CUÁNDO CORRERLO
--    Después de CUALQUIER migración que toque tablas, políticas o roles.
--    Cuesta unos segundos y no deja basura: todo lo que crea, lo borra.
--
--  DÓNDE CORRERLO
--    En el editor SQL de Supabase (supabase.com → el proyecto → SQL Editor).
--    NO en la Terminal.
--
--  CÓMO SE LEE
--    Sale una tabla. Si toda la columna del veredicto dice ✅, están
--    separados. Si aparece un ❌, ese renglón dice exactamente qué se filtró.
--
--  ── POR QUÉ EL PRIMER RENGLÓN ES EL MÁS IMPORTANTE ──
--  El primero solo confirma que la prueba corre como `authenticated`. Parece
--  un trámite y es lo contrario: el DUEÑO de las tablas se salta RLS por
--  diseño. Una prueba escrita sin ese cambio de rol da ✅ en todo aunque las
--  políticas estén borradas — ya pasó una vez aquí. Si ese renglón sale ❌,
--  los otros once no valen nada, sin importar lo que digan.
-- ════════════════════════════════════════════════════════════════════════════

create temp table if not exists aislamiento (n int, paso text, esperado text, obtuvo text, bien boolean);
truncate aislamiento;
grant insert, select on aislamiento to authenticated;

do $$
declare
  A uuid;
  B  uuid := '00000000-0000-4000-8000-0000000000bb';   -- negocio de prueba
  uB uuid := '00000000-0000-4000-8000-0000000000cc';   -- su dueño
  n int; anota text;
begin
  -- Se compara contra un negocio REAL, el más viejo que haya. Inventar los
  -- dos lados dejaría fuera lo que de verdad importa: que los datos que ya
  -- existen queden escondidos.
  select id into A from empresas order by created_at asc limit 1;
  if A is null then
    insert into aislamiento values (0, 'hay un negocio real contra cual comparar',
                                    'al menos uno', 'ninguno', false);
    return;
  end if;

  insert into empresas (id, slug, nombre, categoria, plan, activa, estado, marca, saludo, acciones, politicas)
    values (B, 'zzz-prueba-aislamiento', 'Negocio de prueba', 'Prueba', 'prueba',
            true, 'publicado', '{}'::jsonb, 'Hola', '[]'::jsonb, '[]'::jsonb)
    on conflict (id) do nothing;

  insert into auth.users (id, email, instance_id, aud, role)
    values (uB, 'prueba-aislamiento@ejemplo.invalid',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
    on conflict (id) do nothing;
  insert into usuarios (id, email, rol, empresa_id, activo)
    values (uB, 'prueba-aislamiento@ejemplo.invalid', 'dueno', B, true)
    on conflict (id) do update set rol = 'dueno', empresa_id = B, activo = true;

  insert into conversaciones (empresa_id, sesion, mensajes_cifrados) values (B, 'ses-prueba', 'x.y.z');
  insert into leads (empresa_id, datos_cifrados, consintio)          values (B, 'x.y.z', true);
  insert into citas (empresa_id, dia, hora, estado)                  values (B, current_date + 3, '10:00', 'apartada');

  -- ══ de aquí en adelante, con los ojos del segundo dueño ══
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000cc","role":"authenticated"}';

  insert into aislamiento values (0, 'la prueba corre como authenticated (si esto falla, lo demás no vale)',
                                  'authenticated', current_user, current_user = 'authenticated');

  select count(*) into n from empresas       where id = A;          insert into aislamiento values (1, 've el NEGOCIO ajeno',        '0', n::text, n = 0);
  select count(*) into n from conversaciones where empresa_id = A;  insert into aislamiento values (2, 'lee CONVERSACIONES ajenas',  '0', n::text, n = 0);
  select count(*) into n from leads          where empresa_id = A;  insert into aislamiento values (3, 'lee SOLICITUDES ajenas',     '0', n::text, n = 0);
  select count(*) into n from citas          where empresa_id = A;  insert into aislamiento values (4, 've la AGENDA ajena',         '0', n::text, n = 0);
  select count(*) into n from bitacora       where empresa_id = A;  insert into aislamiento values (5, 'lee la BITÁCORA ajena',      '0', n::text, n = 0);
  select count(*) into n from usuarios       where empresa_id is distinct from B;
                                                                    insert into aislamiento values (6, 've USUARIOS de otros',       '0', n::text, n = 0);

  -- Un aislamiento que también le esconda LO SUYO no es seguridad: es una
  -- aplicación rota. Se comprueba igual que lo demás.
  select count(*) into n from empresas where id = B;                insert into aislamiento values (7, 've LO SUYO',                 '1', n::text, n = 1);
  select count(*) into n from citas    where empresa_id = B;        insert into aislamiento values (8, 've SU agenda',               '1', n::text, n = 1);

  -- Leer no es lo único que importa. Escribir en lo ajeno es peor.
  begin
    insert into citas (empresa_id, dia, hora, estado) values (A, current_date + 9, '08:00', 'apartada');
    insert into aislamiento values (9, 'APARTA cita en agenda ajena', 'rechazado', 'LO LOGRÓ', false);
  exception when others then
    insert into aislamiento values (9, 'APARTA cita en agenda ajena', 'rechazado', 'rechazado', true);
  end;

  begin
    update empresas set nombre = 'secuestrado' where id = A;
    get diagnostics n = row_count;
    insert into aislamiento values (10, 'RENOMBRA el negocio ajeno', '0 filas', n::text || ' filas', n = 0);
  exception when others then
    insert into aislamiento values (10, 'RENOMBRA el negocio ajeno', '0 filas', 'rechazado', true);
  end;

  begin
    update usuarios set rol = 'superadmin' where id = uB;
    select rol into anota from usuarios where id = uB;
    insert into aislamiento values (11, 'SE ASCIENDE a superadmin', 'sigue dueno',
                                    coalesce(anota, '?'), anota is distinct from 'superadmin');
  exception when others then
    insert into aislamiento values (11, 'SE ASCIENDE a superadmin', 'sigue dueno', 'rechazado', true);
  end;

  -- ══ limpieza: no queda rastro del negocio de prueba ══
  reset role;
  delete from citas          where empresa_id = B;
  delete from leads          where empresa_id = B;
  delete from conversaciones where empresa_id = B;
  delete from usuarios       where id = uB;
  delete from auth.users     where id = uB;
  delete from empresas       where id = B;
end $$;

select
  case when bien then '✅' else '❌ SE FILTRÓ' end as veredicto,
  paso, esperado, obtuvo
from aislamiento
order by bien asc, n asc;   -- lo que falle sale hasta arriba
