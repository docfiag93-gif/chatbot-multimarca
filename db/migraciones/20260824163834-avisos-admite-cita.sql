-- `avisos_tipo_check` solo admitía urgencia, lead y resumen. El aviso de
-- cita —que se acaba de agregar— habría sido rechazado por la base en cada
-- intento. Y hasta ayer ese insert vivía dentro de un catch mudo, así que
-- se habría perdido sin dejar rastro: el panel diría «todavía no se ha
-- enviado ningún aviso» mientras se enviaban.
--
-- Es el tercer sitio donde el mismo patrón mordía: una lista cerrada en la
-- base que el código no conoce, más un catch que la tapa.
alter table public.avisos drop constraint if exists avisos_tipo_check;

alter table public.avisos
  add constraint avisos_tipo_check
  check (tipo in ('urgencia','lead','cita','resumen'));

comment on column public.avisos.tipo is
  'Al agregar un tipo nuevo en el código hay que agregarlo TAMBIÉN aquí: la '
  'lista es cerrada y un tipo desconocido hace que la base rechace el aviso.';
