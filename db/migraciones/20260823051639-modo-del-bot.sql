alter table public.empresas
  add column if not exists modo text not null default 'activo'
  check (modo in ('activo','recados','apagado'));

comment on column public.empresas.modo is
  'Interruptor del DUEÑO, distinto de `activa` (suspensión de plataforma). '
  '`activo`: contesta con IA. `recados`: no llama a la IA, solo toma datos y '
  'deriva. `apagado`: dice que está fuera de servicio. Existe para poder '
  'callar al bot en segundos cuando contesta mal, sin borrar nada ni esperar '
  'a que un administrador conteste el teléfono.';
