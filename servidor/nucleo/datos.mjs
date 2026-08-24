// ════════════════════════════════════════════════════════════════════════
//  La capa de datos del widget público
//
//  Aquí vive la ÚNICA parte del sistema que usa la llave de servicio de
//  Supabase (la que se salta RLS). Es inevitable: quien escribe en el chat
//  no tiene cuenta. Por eso este archivo hace solo cuatro operaciones fijas
//  y ninguna consulta libre — no hay forma de pedirle desde afuera que traiga
//  otra cosa.
//
//  El panel NO pasa por aquí: usa el token de la persona y RLS decide.
//
//  ── SOBRE LA MIGRACIÓN DESDE marcas.mjs ──
//  Si la empresa existe en la base, manda la base. Si no, se cae a
//  marcas.mjs. Así el chatbot que ya funciona no se rompe el día que se
//  active la base, y se pueden mover las marcas una por una.
// ════════════════════════════════════════════════════════════════════════

import { env } from './entorno.mjs';
import { clienteSupabase, usuarioDelToken } from './supabase.mjs';
import { descifrar, cifrar } from '../../publico/cerebro/cifrado.mjs';
import { marcaPublica, obtenerMarca } from './marcas.mjs';
import { normalizarPerfil, perfilPublico } from '../../publico/cerebro/perfil.mjs';
import { enviarAviso, recortar } from './avisos.mjs';

export function servicio() {
  const url = env('SUPABASE_URL');
  const llave = env('SUPABASE_SERVICE_KEY');
  if (!url || !llave) return null;              // sin base: se trabaja con archivo
  return clienteSupabase({ url, llave });
}

const MAESTRA = () => env('CHATBOT_CLAVE');

/**
 * Trae la empresa por su slug, ya descifrada, lista para armar el prompt.
 * Devuelve null si no existe en la base (para que el llamador use el archivo).
 */
export async function empresaPorSlug(slug, { incluirSuspendidas = false } = {}) {
  const sb = servicio();
  if (!sb) return null;

  let fila;
  try {
    const filas = await sb.seleccionar('empresas', '*', `slug=eq.${encodeURIComponent(slug)}&limit=1`);
    fila = filas?.[0];
  } catch (e) { return null; }
  if (!fila) return null;

  // Una empresa suspendida no contesta. Se distingue de "no existe" para
  // poder darle al visitante un mensaje honesto en vez de un error.
  //
  // `incluirSuspendidas` lo usa SOLO la vista previa del dueño, que ya
  // demostró con su sesión que el negocio es suyo. Para todos los demás la
  // suspensión sigue siendo un muro.
  // El `id` viaja aunque esté suspendida: sin él no hay contra qué comprobar
  // si quien pregunta es el dueño, y la vista previa nunca se activaría. No
  // sale al navegador — `configPublica` arma su propia respuesta para este
  // caso y ahí el id va en null.
  if (!fila.activa && !incluirSuspendidas) {
    return { suspendida: true, id: fila.id, nombre: fila.nombre };
  }

  const clave = MAESTRA();
  const abrir = async (campo) => {
    if (!clave || !fila[campo]) return null;
    try { return await descifrar(clave, fila.id, fila[campo]); }
    catch (e) { return null; }
  };

  // `perfil` es el bulto genérico: catálogo, horarios, ubicaciones, atributos
  // y todo lo que no merece columna propia. Las columnas sueltas siguen
  // existiendo porque ya hay datos en ellas y porque son las que se consultan.
  const perfilGuardado = await abrir('perfil_cifrado') || {};

  return normalizarPerfil({
    ...perfilGuardado,
    id: fila.id,
    slug: fila.slug,
    nombre: fila.nombre,
    // categoría LIBRE. Si viene una fila vieja con `dominio`, se traduce a
    // una categoría legible en vez de perder el dato.
    categoria: fila.categoria || traducirDominioViejo(fila.dominio),
    identidad: fila.marca || {},
    // El interruptor del dueño. Viaja junto al perfil para que el bot pueda
    // decidir SIN otra consulta: apagar tiene que ser inmediato.
    modo: fila.modo || 'activo',
    saludo: fila.saludo,
    sugerencias: fila.sugerencias || [],
    descargo: fila.descargo,
    captura: fila.captura || {},
    contactos: fila.contactos || {},
    // Las políticas se ENCIENDEN a mano. Una fila vieja marcada 'clinico'
    // conserva su política; ninguna otra la hereda.
    politicas: Array.isArray(fila.politicas) ? fila.politicas
             : (fila.dominio === 'clinico' ? ['urgencias-clinicas'] : []),
    acciones: Array.isArray(fila.acciones) ? fila.acciones : perfilGuardado.acciones,
    plan: fila.plan,
    estado: fila.activa === false ? 'suspendido' : 'publicado',
    tono:         await abrir('persona_cifrada')      || perfilGuardado.tono,
    conocimiento: await abrir('conocimiento_cifrado') || perfilGuardado.conocimiento || [],
    limites:      await abrir('limites_cifrados')     || perfilGuardado.limites || [],
    destinos:     await abrir('destinos_cifrados')    || null,
    // El enlace saliente lleva un SECRETO compartido, así que viaja cifrado
    // como todo lo demás que no debe poder leerse desde la base.
    enlace:       await abrir('enlace_cifrado')       || null,
    ...repartirLlaves(await abrir('llaves_cifradas')),
  });
}

/**
 * Traducción de las dos únicas opciones que existían antes.
 *
 * No se borra el dato de las filas viejas: se convierte en una categoría
 * legible. Que el sistema ya no tenga sectores fijos no significa que un
 * cliente deba perder lo que había escrito.
 */
function traducirDominioViejo(dominio) {
  if (dominio === 'clinico') return 'Salud y bienestar';
  if (dominio === 'comercial') return 'Comercio y tienda';
  return '';
}

/**
 * El bulto cifrado de llaves guarda dos cosas distintas y conviene separarlas
 * antes de que salgan de aquí:
 *
 *   { orden: ['gemini','groq'], claves: { gemini: '...', groq: '...' } }
 *
 * `orden` deja que cada marca elija su cadena de proveedores; `claves` deja
 * que traiga su propia cuenta y pague su propio consumo. Ninguna de las dos
 * debería obligar a tocar código ni a redesplegar.
 *
 * Se acepta también el formato viejo —un objeto plano de llaves, sin `claves`—
 * para no romper lo que ya estuviera guardado.
 */
function repartirLlaves(blob) {
  if (!blob || typeof blob !== 'object') return { llaves: null, proveedores: null };
  const claves = blob.claves && typeof blob.claves === 'object' ? blob.claves : blob;
  const orden  = Array.isArray(blob.orden) ? blob.orden : null;
  return { llaves: claves, proveedores: orden };
}

/**
 * Encuentra el negocio por su número de WhatsApp.
 *
 * WhatsApp no manda el slug: manda a QUÉ número le escribieron. El
 * `phone_number_id` que da Meta es lo único que llega, así que es lo que se
 * guarda en cada empresa y por lo que se busca aquí.
 */
export async function empresaPorWhatsapp(phoneId) {
  const sb = servicio();
  if (!sb || !phoneId) return null;

  let fila;
  try {
    const filas = await sb.seleccionar('empresas', '*',
      `whatsapp_id=eq.${encodeURIComponent(phoneId)}&limit=1`);
    fila = filas?.[0];
  } catch (e) { return null; }
  if (!fila) return null;

  return empresaPorSlug(fila.slug);
}

/**
 * La marca que va a usar el bot: base primero, archivo después.
 * `origen` sirve para depurar sin adivinar de dónde salió la configuración.
 */
export async function resolverMarca(slug, { incluirSuspendidas = false } = {}) {
  const dela = await empresaPorSlug(slug, { incluirSuspendidas });
  if (dela?.suspendida) {
    return { suspendida: true, id: dela.id, nombre: dela.nombre, origen: 'base' };
  }
  if (dela) return { ...dela, origen: 'base' };
  return { ...obtenerMarca(slug), id: null, origen: 'archivo' };
}

/** Lo público que pide el widget para pintarse. */
export async function configPublica(slug) {
  const dela = await empresaPorSlug(slug);
  if (dela?.suspendida) {
    return { id: null, nombre: dela.nombre, suspendida: true,
             marca: { primario: '#64748b', acento: '#94a3b8', fondo: '#ffffff',
                      texto: '#0f172a', burbujaIA: '#f1f5f9', avatar: '💬' },
             identidad: { primario: '#64748b', acento: '#94a3b8', fondo: '#ffffff',
                      texto: '#0f172a', burbujaIA: '#f1f5f9', avatar: '💬' },
             saludo: 'Este chat está fuera de servicio por el momento.',
             sugerencias: [], descargo: '', captura: { activa: false } };
  }
  if (dela) return perfilPublico(dela);
  return marcaPublica(slug);
}

// ── Guardar lo que pasa ─────────────────────────────────────────────────

/**
 * Guarda la conversación CIFRADA. Si no hay base o no hay llave, no guarda
 * nada y no truena: es preferible un chat sin historial que un chat caído.
 */
export async function guardarConversacion({ empresa, sesion, mensajes, urgencia, motivo, via, sinDato }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !clave || !empresa?.id) return null;
  try {
    const filas = await sb.insertar('conversaciones', [{
      empresa_id: empresa.id,
      sesion: String(sesion || '').slice(0, 64),
      mensajes_cifrados: await cifrar(clave, empresa.id, mensajes),
      urgencia: !!urgencia,
      // La CATEGORÍA de la urgencia, nunca la frase de quien escribió: así
      // puede contar urgencias sin que nadie lea un síntoma de pasada.
      motivo_urgencia: urgencia ? String(motivo || '').slice(0, 80) : null,
      via: via || null,
      // Cuándo el bot NO supo. Es la lista de qué le falta al negocio.
      sin_dato: !!sinDato,
    }]);
    return filas?.[0]?.id || null;
  } catch (e) { return null; }
}

export async function guardarLead({ empresa, lead }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !clave || !empresa?.id) throw new Error('La base no está configurada');
  const filas = await sb.insertar('leads', [{
    empresa_id: empresa.id,
    datos_cifrados: await cifrar(clave, empresa.id, {
      nombre: lead.nombre, telefono: lead.telefono, motivo: lead.motivo || '',
    }),
    consintio: !!lead.consiente,
    aviso_version: lead.aviso_version || 'v1',
  }]);
  return filas?.[0]?.id || null;
}

/**
 * Avisa y deja constancia. Nunca lanza: si el aviso falla, a quien escribió ya
 * recibió su respuesta y eso es lo que no se puede romper.
 */
export async function avisar({ empresa, tipo, titulo, lineas, conversacionId }) {
  const r = await enviarAviso({
    tipo, empresa: empresa?.nombre || 'Chat', destinos: empresa?.destinos,
    titulo, lineas,
  });

  const sb = servicio();
  if (sb && empresa?.id) {
    try {
      await sb.insertar('avisos', [{
        empresa_id: empresa.id, tipo, canal: r.canal,
        destino: r.destino || null,
        estado: r.ok ? 'enviado' : 'fallido',
        detalle: { nota: String(r.detalle || '').slice(0, 200) },
        conversacion_id: conversacionId || null,
      }]);
    } catch (e) {
      /* NO se silencia. El registro sigue siendo deseable y no indispensable
         —no vale tumbar un aviso por no poder anotarlo— pero un catch mudo
         es exactamente lo que dejó la bitácora vacía durante meses sin que
         nadie se enterara.

         El panel de plataforma lee esta tabla para mostrar «avisos enviados».
         Si los insert se rechazan en silencio, esa pantalla dice «todavía no
         se ha enviado ningún aviso» mientras se están enviando. */
      registrarFalloDeAviso(String(e.message || e).slice(0, 140));
    }
  }
  return r;
}

/* Los últimos fallos al ANOTAR un aviso. Vive en memoria del worker: no
   sirve para auditar —para eso está la tabla— sino para que el diagnóstico
   pueda decir «se están enviando avisos y no se están registrando» en vez de
   dejar una pantalla vacía que parece normal. */
const _fallosDeAviso = [];
function registrarFalloDeAviso(razon) {
  _fallosDeAviso.unshift({ razon, en: new Date().toISOString() });
  while (_fallosDeAviso.length > 5) _fallosDeAviso.pop();
}
export function fallosDeAviso() { return [..._fallosDeAviso]; }

/* ══════════════════════════════════════════════════════════════════════
   CUANDO CONTESTA UNA PERSONA

   Hasta ahora «te paso con un humano» era una promesa a medias: la
   conversación se guardaba, pero nadie podía escribir dentro de ella. El
   visitante quedaba esperando en una ventana que solo sabía contestar sola.

   Los mensajes de la persona van en su propia columna, no revueltos con
   los del bot. Dos razones, y las dos importan:

     · El widget entrega solo lo nuevo. Si estuvieran mezclados habría que
       mandarle la charla entera en cada sondeo para que encontrara la
       diferencia.
     · En el expediente queda claro qué dijo la máquina y qué dijo una
       persona. Donde hay algo delicado en juego, eso no es formato.
   ══════════════════════════════════════════════════════════════════════ */

/** Agrega un mensaje escrito por una persona del negocio. */
export async function responderComoHumano({ empresaId, conversacionId, texto, autor }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !clave || !conversacionId) return { ok: false, razon: 'sin_base' };

  const fila = (await sb.seleccionar('conversaciones',
    'id,empresa_id,humanos_cifrados', `id=eq.${conversacionId}&limit=1`))?.[0];
  if (!fila) return { ok: false, razon: 'no_existe' };
  if (empresaId && fila.empresa_id !== empresaId) return { ok: false, razon: 'ajena' };

  let previos = [];
  try { previos = await descifrar(clave, fila.empresa_id, fila.humanos_cifrados) || []; }
  catch (e) { previos = []; }

  previos.push({
    texto: String(texto).slice(0, 2000),
    en: new Date().toISOString(),
    autor: String(autor || '').slice(0, 60),
    entregado: false,
  });

  await sb.actualizar('conversaciones', `id=eq.${conversacionId}`, {
    humanos_cifrados: await cifrar(clave, fila.empresa_id, previos),
    humano_pendiente: true,
  });
  return { ok: true, cuantos: previos.length };
}

/**
 * Lo que una persona escribió y el visitante todavía no ha visto.
 *
 * Se busca por la sesión del widget, no por el id de la conversación: el
 * navegador conoce la suya y nada más. Pedirle el id sería darle una llave
 * para asomarse a conversaciones ajenas.
 */
export async function recogerHumanos({ empresa, sesion }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !clave || !empresa?.id || !sesion) return [];

  const fila = (await sb.seleccionar('conversaciones', 'id,empresa_id,humanos_cifrados',
    `empresa_id=eq.${empresa.id}&sesion=eq.${encodeURIComponent(sesion)}` +
    '&humano_pendiente=is.true&order=created_at.desc&limit=1'))?.[0];
  if (!fila) return [];

  let mensajes = [];
  try { mensajes = await descifrar(clave, fila.empresa_id, fila.humanos_cifrados) || []; }
  catch (e) { return []; }

  const nuevos = mensajes.filter(m => !m.entregado);
  if (!nuevos.length) return [];

  // Se marcan entregados ANTES de devolverlos. Si se hiciera al revés y la
  // escritura fallara, el visitante vería el mismo mensaje una y otra vez
  // en cada sondeo.
  nuevos.forEach(m => { m.entregado = true; });
  try {
    await sb.actualizar('conversaciones', `id=eq.${fila.id}`, {
      humanos_cifrados: await cifrar(clave, fila.empresa_id, mensajes),
      humano_pendiente: false,
    });
  } catch (e) { return []; }

  return nuevos.map(m => ({ texto: m.texto, en: m.en }));
}


/* ══════════════════════════════════════════════════════════════════════
   CITAS  ·  el bot aparta, una persona confirma
   ══════════════════════════════════════════════════════════════════════ */

/** Lo ya apartado, para no ofrecerlo dos veces. */
export async function huecosOcupados(empresaId) {
  const sb = servicio();
  if (!sb || !empresaId) return [];
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    return (await sb.seleccionar('citas', 'dia,hora',
      `empresa_id=eq.${empresaId}&estado=neq.cancelada&dia=gte.${hoy}&limit=500`)) || [];
  } catch (e) { return []; }
}

/**
 * Aparta un hueco.
 *
 * Nace SIEMPRE como «apartada», nunca confirmada. Apartar es reversible: si
 * el bot se equivocó, se libera y no pasó nada. Confirmar no lo es —
 * alguien ya reacomodó su día.
 *
 * Si dos personas piden el mismo hueco a la vez, gana quien llegó primero y
 * la otra recibe un no honesto. Eso lo decide el índice único de la base, no
 * este código: comprobar «¿está libre?» y luego insertar deja una rendija
 * entre las dos cosas, y en esa rendija caben dos citas.
 */
export async function apartarCita({ empresa, dia, hora, datos, sesion }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !empresa?.id) return { ok: false, razon: 'sin_base' };

  try {
    const filas = await sb.insertar('citas', [{
      empresa_id: empresa.id, dia, hora, estado: 'apartada',
      sesion: String(sesion || '').slice(0, 64),
      datos_cifrados: clave ? await cifrar(clave, empresa.id, datos || {}) : null,
    }]);
    return { ok: true, id: filas?.[0]?.id };
  } catch (e) {
    if (/23505|duplicate key/i.test(String(e.message))) {
      return { ok: false, razon: 'ya_tomado' };
    }
    return { ok: false, razon: 'error' };
  }
}

/** La agenda, ya descifrada, para el panel. */
export async function citasDe({ empresaId, desde }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb) return [];

  const partes = [];
  if (empresaId) partes.push(`empresa_id=eq.${empresaId}`);
  partes.push(`dia=gte.${desde || new Date().toISOString().slice(0, 10)}`);
  partes.push('order=dia.asc,hora.asc', 'limit=200');

  let filas = [];
  try { filas = await sb.seleccionar('citas', '*', partes.join('&')) || []; }
  catch (e) { return []; }

  const salida = [];
  for (const f of filas) {
    let datos = null;
    try { datos = clave ? await descifrar(clave, f.empresa_id, f.datos_cifrados) : null; }
    catch (e) { datos = null; }
    const { datos_cifrados, ...resto } = f;
    salida.push({ ...resto, datos });
  }
  return salida;
}

/** Confirmar o cancelar. Lo hace una persona, nunca el bot. */
export async function moverCita({ empresaId, id, estado }) {
  const sb = servicio();
  if (!sb) return { ok: false };
  const filtro = empresaId ? `id=eq.${id}&empresa_id=eq.${empresaId}` : `id=eq.${id}`;
  try {
    const g = await sb.actualizar('citas', filtro, { estado });
    return { ok: !!g?.[0], cita: g?.[0] };
  } catch (e) { return { ok: false }; }
}


/* ══════════════════════════════════════════════════════════════════════
   ¿ESTE ES SU PROPIO BOT?

   Un negocio suspendido o sin publicar contesta «fuera de servicio» a todo
   el mundo — incluido su dueño. Eso deja al dueño sin poder ver lo que
   acaba de configurar antes de soltarlo a sus clientes, que es exactamente
   cuando más falta hace mirarlo.

   Con sesión de dueño, la suspensión no aplica: puede hablar con su bot,
   probar la agenda y corregir antes de publicar. Para cualquier otro sigue
   fuera de servicio.

   El token se verifica contra el servidor de autenticación, nunca
   decodificándolo aquí: decodificar un JWT sin comprobar la firma es
   justamente como se cuela alguien con un token inventado.
   ══════════════════════════════════════════════════════════════════════ */
export async function esSuPropioBot({ token, empresaId }) {
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  if (!token || !empresaId || !url || !anon) return false;

  const cuenta = await usuarioDelToken(url, anon, token);
  if (!cuenta) return false;

  const sb = servicio();
  if (!sb) return false;
  try {
    const filas = await sb.seleccionar('usuarios', 'rol,empresa_id,activo',
      `id=eq.${cuenta.id}&limit=1`);
    const yo = filas?.[0];
    if (!yo || !yo.activo) return false;
    return yo.rol === 'superadmin' || (yo.rol === 'dueno' && yo.empresa_id === empresaId);
  } catch (e) { return false; }
}
