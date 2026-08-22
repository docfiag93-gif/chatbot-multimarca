// ════════════════════════════════════════════════════════════════════════
//  Compatibilidad — el nombre viejo de las cosas
//
//  Este archivo era el registro de marcas: tenía dentro un consultorio y un
//  café escritos a mano, y el sistema entero dependía de ellos. Ya no.
//
//  Ahora es una capa delgada:
//    · el MODELO de un negocio vive en perfil.mjs
//    · los EJEMPLOS viven en semillas.mjs (borrables)
//    · los negocios REALES viven en la base de datos
//
//  Se conserva porque hay código —y sitios de clientes— que todavía piden
//  `obtenerMarca` y `marcaPublica`. Traduce y se quita de en medio.
//
//  Cuando ya no queden llamadas a estas tres funciones, este archivo se borra.
// ════════════════════════════════════════════════════════════════════════

import { SEMILLAS } from './semillas.mjs';
import { normalizarPerfil, perfilPublico, NEUTRO } from './perfil.mjs';

/** Los ejemplos, ya normalizados. Se mantiene el nombre `MARCAS` por compatibilidad. */
export const MARCAS = Object.fromEntries(
  Object.entries(SEMILLAS).map(([slug, s]) => [slug, normalizarPerfil(s)]));

/**
 * Busca un negocio entre los ejemplos.
 *
 * OJO con el cambio de comportamiento: antes, pedir una marca inexistente
 * devolvía el consultorio. Eso significaba que cualquier error de dedo
 * mostraba un consultorio médico en el sitio de quien fuera. Ahora devuelve
 * un perfil NEUTRO con ese slug: sobrio, sin rubro y sin inventarse a quién
 * pertenece.
 */
export function obtenerMarca(slug) {
  if (slug && MARCAS[slug]) return MARCAS[slug];
  return normalizarPerfil({ slug: slug || 'negocio', nombre: NEUTRO.nombre });
}

/** Lo único que el navegador tiene derecho a ver. */
export function marcaPublica(slug) {
  return perfilPublico(obtenerMarca(slug));
}
