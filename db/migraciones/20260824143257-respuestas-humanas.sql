alter table public.conversaciones
  add column if not exists humanos_cifrados text,
  add column if not exists humano_pendiente boolean not null default false;

create index if not exists conversaciones_humano_pendiente_idx
  on public.conversaciones (empresa_id, sesion) where humano_pendiente;

comment on column public.conversaciones.humanos_cifrados is
  'Mensajes escritos por una PERSONA del negocio dentro de esta conversación, '
  'cifrados igual que el resto. Van aquí y no en `mensajes_cifrados` para que '
  'el widget pueda entregar solo lo nuevo sin volver a mandar la charla entera, '
  'y para que quede claro en el expediente qué dijo el bot y qué dijo un humano.';

comment on column public.conversaciones.humano_pendiente is
  'Hay algo escrito por una persona que el visitante todavía no recibe. Es lo '
  'único que el widget consulta al sondear: un booleano indexado en vez de '
  'descifrar la conversación en cada sondeo.';
