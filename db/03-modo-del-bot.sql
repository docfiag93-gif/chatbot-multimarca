-- ════════════════════════════════════════════════════════════════════════
--  EL INTERRUPTOR DEL BOT  ·  ya aplicado en Supabase (migración modo_del_bot)
--
--  Queda aquí como respaldo y como explicación. No hace falta correrlo.
--
--  Es del DUEÑO, no de la plataforma: `activa` sigue siendo la suspensión
--  que aplica el superadmin (falta de pago, abuso). `modo` es el botón que
--  aprieta el médico a las once de la noche cuando el bot contestó mal.
--  Obligarlo a pedir permiso para callarlo sería al revés de como debe ser.
--
--  TRES estados y no dos. Apagar del todo deja sin nada a quien escribe, y
--  esa persona no vuelve. `recados` es la salida honesta: el bot deja de
--  hablar por su cuenta, dice la verdad y sigue tomando el teléfono.
-- ════════════════════════════════════════════════════════════════════════

alter table public.empresas
  add column if not exists modo text not null default 'activo'
  check (modo in ('activo','recados','apagado'));

comment on column public.empresas.modo is
  'Interruptor del dueño. activo: contesta con IA. recados: no llama a la IA, '
  'solo toma datos. apagado: no contesta. La política clínica corre en los tres.';
