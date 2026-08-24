alter table public.conversaciones
  add column if not exists sin_dato boolean not null default false;

create index if not exists conversaciones_sin_dato_idx
  on public.conversaciones (empresa_id, created_at desc) where sin_dato;

comment on column public.conversaciones.sin_dato is
  'El anclaje tuvo que degradar la respuesta: el bot iba a decir un dato que '
  'no estaba cargado y acabó admitiendo que no lo sabe. Se guarda porque es '
  'la lista más útil que existe de qué le falta al negocio — cada una es una '
  'pregunta real de una persona real que se quedó sin contestar.';
