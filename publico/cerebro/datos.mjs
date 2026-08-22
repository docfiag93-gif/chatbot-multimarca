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
import { clienteSupabase } from './supabase.mjs';
import { descifrar, cifrar } from './cifrado.mjs';
import { marcaPublica, obtenerMarca } from './marcas.mjs';
import { normalizarPerfil, perfilPublico } from './perfil.mjs';
import { enviarAviso, recortar } from './avisos.mjs';

function servicio() {
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
export async function empresaPorSlug(slug) {
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
  if (!fila.activa) return { suspendida: true, nombre: fila.nombre };

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
 * La marca que va a usar el bot: base primero, archivo después.
 * `origen` sirve para depurar sin adivinar de dónde salió la configuración.
 */
export async function resolverMarca(slug) {
  const dela = await empresaPorSlug(slug);
  if (dela?.suspendida) return { suspendida: true, nombre: dela.nombre, origen: 'base' };
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
export async function guardarConversacion({ empresa, sesion, mensajes, urgencia, motivo, via }) {
  const sb = servicio(); const clave = MAESTRA();
  if (!sb || !clave || !empresa?.id) return null;
  try {
    const filas = await sb.insertar('conversaciones', [{
      empresa_id: empresa.id,
      sesion: String(sesion || '').slice(0, 64),
      mensajes_cifrados: await cifrar(clave, empresa.id, mensajes),
      urgencia: !!urgencia,
      // La CATEGORÍA clínica, nunca la frase del paciente: así el tablero
      // puede contar urgencias sin que nadie lea un síntoma de pasada.
      motivo_urgencia: urgencia ? String(motivo || '').slice(0, 80) : null,
      via: via || null,
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
 * Avisa y deja constancia. Nunca lanza: si el aviso falla, el paciente ya
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
    } catch (e) { /* el registro es deseable, no indispensable */ }
  }
  return r;
}
