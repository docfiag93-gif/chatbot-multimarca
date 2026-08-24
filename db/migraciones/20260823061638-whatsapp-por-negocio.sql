alter table public.empresas
  add column if not exists whatsapp_id text;

create unique index if not exists empresas_whatsapp_idx
  on public.empresas (whatsapp_id) where whatsapp_id is not null;

comment on column public.empresas.whatsapp_id is
  'El phone_number_id que da Meta para el número de WhatsApp de este negocio. '
  'Es como el mensaje entrante encuentra a QUÉ negocio pertenece: WhatsApp no '
  'manda el slug, manda a qué número le escribieron. Único: dos negocios no '
  'pueden compartir número sin que las conversaciones se crucen.';
