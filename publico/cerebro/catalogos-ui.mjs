// ════════════════════════════════════════════════════════════════════════
//  Sugerencias para la interfaz — NO son reglas
//
//  Esta lista existe para ahorrarle tecleo a quien da de alta un negocio. No
//  valida nada, no restringe nada y el modelo de datos ni la consulta.
//
//  Vive fuera de perfil.mjs a propósito: el modelo no debe conocer ningún
//  rubro. Si mañana esta lista se borra, el sistema sigue aceptando cualquier
//  categoría — porque `categoria` siempre fue texto libre.
//
//  "Otro" va al final y no es un caso especial: es el recordatorio de que la
//  lista está incompleta por diseño.
// ════════════════════════════════════════════════════════════════════════

export const CATEGORIAS_SUGERIDAS = [
  'Comercio y tienda',
  'Restaurante y alimentos',
  'Servicios profesionales',
  'Salud y bienestar',
  'Educación y formación',
  'Bienes raíces',
  'Taller y reparación',
  'Proveedor y mayoreo',
  'Turismo y hospedaje',
  'Belleza y cuidado personal',
  'Deporte y acondicionamiento',
  'Otro',
];
