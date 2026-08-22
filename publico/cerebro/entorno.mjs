// ════════════════════════════════════════════════════════════════════════
//  El entorno — de dónde salen las llaves, sin casarse con un proveedor
//
//  El problema: Netlify corre sobre Node y las variables viven en
//  `process.env`. Cloudflare corre sobre Workers, donde `process` NO EXISTE
//  y las variables llegan como un objeto por petición. Escribir `process.env`
//  directo amarra el chatbot a Netlify para siempre.
//
//  Este archivo es la traducción. El resto del código pregunta `env('X')` y
//  no le importa dónde está corriendo. Ese es justo el punto: este producto
//  tiene que poder mudarse de casa sin cirugía.
//
//  SOBRE GUARDAR EL ENTORNO EN UNA VARIABLE DEL MÓDULO:
//  En Workers, un mismo isolate atiende varias peticiones a la vez, así que
//  guardar estado compartido normalmente es un error. Aquí es seguro por una
//  razón concreta: las variables de entorno son IGUALES para todas las
//  peticiones de un mismo despliegue. No hay datos de un usuario que puedan
//  filtrarse a otro. Si algún día esto guardara algo por petición, dejaría
//  de ser seguro y habría que pasarlo como parámetro.
// ════════════════════════════════════════════════════════════════════════

let _entorno = null;

/** La llama el envoltorio de cada plataforma antes de atender. */
export function ponerEntorno(obj) {
  if (obj && typeof obj === 'object') _entorno = obj;
}

/**
 * Lee una variable. Busca primero lo que puso la plataforma y se cae a
 * process.env, que es lo que existe en Netlify y en Node local.
 */
export function env(nombre) {
  if (_entorno && nombre in _entorno) return _entorno[nombre];
  // globalThis.process en vez de process a secas: en Workers la variable
  // no está declarada y `process.env` lanzaría ReferenceError.
  return globalThis.process?.env?.[nombre];
}

/** Para los pings de salud: saber qué hay puesto sin revelar los valores. */
export function hay(...nombres) {
  return Object.fromEntries(nombres.map(n => [n, !!env(n)]));
}
