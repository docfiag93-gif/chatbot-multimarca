-- Los numeros a los que el VISITANTE puede escribir. No se cifran a proposito:
-- se le muestran a cualquiera que abra el chat, o sea que ya son publicos.
-- Cifrarlos daria trabajo sin proteger nada.
--
-- Es distinto de destinos_cifrados, que dice a donde te llegan a TI los avisos
-- (tu numero personal). Eso si va cifrado.
alter table public.empresas add column if not exists contactos jsonb not null default '{}'::jsonb;
comment on column public.empresas.contactos is
  'Publico: { consultorio:{whatsapp,telefono,etiqueta}, urgencias:{...} }. El visitante los ve.';
