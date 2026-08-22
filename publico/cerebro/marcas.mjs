// ════════════════════════════════════════════════════════════════════════
//  Este archivo se movió a servidor/nucleo/marcas.mjs
//
//  POR QUÉ SIGUE AQUÍ, VACÍO:
//  Borrarlo no bastó. La red de distribución guardaba una copia vieja en su
//  caché, y una copia cacheada NO desaparece porque el archivo deje de
//  existir en el origen: el borde sigue entregando lo que tenía guardado
//  hasta que expire, y esa copia contenía el texto de los prompts.
//
//  Borrar deja el hueco. Sobrescribir sí reemplaza la copia. Por eso este
//  archivo existe y no dice nada.
//
//  LECCIÓN, POR SI VUELVE A PASAR:
//  Cuando algo que no debía ser público ya se sirvió una vez, quitarlo del
//  repositorio no lo retira de internet. Hay que reemplazar su contenido, y
//  además vaciar la caché.
//
//  Puede borrarse de verdad cuando la caché haya rotado (unos días).
// ════════════════════════════════════════════════════════════════════════

export const MARCAS = {};
export function obtenerMarca() { return null; }
export function marcaPublica() { return null; }
