// ════════════════════════════════════════════════════════════════════════
//  Perfil de negocio — el modelo genérico
//
//  Antes el sistema solo sabía de dos cosas: 'clinico' y 'comercial'. Estaban
//  metidas hasta en la restricción de la base de datos, así que dar de alta
//  una tienda, un taller o una inmobiliaria exigía cambiar el esquema y
//  volver a desplegar. Eso no es un producto multiempresa: es un producto
//  con dos clientes posibles.
//
//  Aquí no hay ningún sector. Un negocio se describe con:
//
//    · categoria  — TEXTO LIBRE. "restaurante", "despacho contable", lo que
//                   sea. Nadie tiene que pedir permiso para existir.
//    · politicas  — módulos que se ACTIVAN a propósito. Ninguno viene puesto.
//    · acciones   — qué puede hacer el bot en ese negocio.
//    · catalogo   — ofertas genéricas: producto, servicio o recurso.
//    · atributos  — lo que no cupo en ningún campo, sin tocar el esquema.
//
//  Los cuatro negocios de ejemplo viven en semillas.mjs y se pueden borrar
//  sin que nada aquí se entere.
// ════════════════════════════════════════════════════════════════════════

/** Lo que se ve cuando el negocio todavía no llenó nada. Deliberadamente
 *  neutro: ni consultorio, ni café, ni tienda. Un negocio sin configurar
 *  debe verse sobrio y profesional, no como el ejemplo de otro rubro. */
export const NEUTRO = {
  nombre: 'Asistente',
  saludo: 'Hola, ¿en qué te ayudo?',
  descripcion: '',
  tono: 'Cercano y claro. Tuteas, frases cortas, sin tecnicismos innecesarios.',
  identidad: {
    primario:  '#334155',
    acento:    '#64748b',
    fondo:     '#ffffff',
    texto:     '#0f172a',
    burbujaIA: '#f1f5f9',
    avatar:    '💬',
    logo:      null,
  },
  sugerencias: [],
  descargo: '',
};

export const IDIOMAS = ['es-MX', 'es-ES', 'en-US', 'pt-BR'];

// Las categorías sugeridas de la interfaz NO viven aquí: son datos de
// presentación, no del modelo. Están en catalogos-ui.mjs, y `categoria`
// acepta cualquier texto sin consultarlas.

/** Tipos de oferta del catálogo. Tres bastan para cubrir cualquier rubro:
 *  lo que se vende, lo que se hace, y lo que se aparta. */
export const TIPOS_OFERTA = ['producto', 'servicio', 'recurso'];

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/* ── normalización ───────────────────────────────────────────────────── */

const texto = (v, max = 400) => (v == null ? '' : String(v).slice(0, max));
const lista = v => (Array.isArray(v) ? v : []);
const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Un slug seguro para usar en `data-marca` y en la URL. */
export function aSlug(valor) {
  return String(valor || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizarOferta(o) {
  return {
    id: texto(o.id || aSlug(o.nombre) || Math.random().toString(36).slice(2, 8), 40),
    tipo: TIPOS_OFERTA.includes(o.tipo) ? o.tipo : 'producto',
    nombre: texto(o.nombre, 120),
    descripcion: texto(o.descripcion, 600),
    // El precio es TEXTO, no número, a propósito: "desde $200", "según
    // proyecto" o "gratis" son respuestas válidas en negocios reales, y
    // forzar un número obliga a mentir o a dejarlo vacío.
    precio: texto(o.precio, 80),
    disponible: o.disponible !== false,
    etiquetas: lista(o.etiquetas).map(t => texto(t, 40)).slice(0, 12),
    atributos: objeto(o.atributos),
  };
}

function normalizarHorario(h) {
  const salida = {};
  for (const dia of DIAS) {
    const v = h[dia];
    if (!v || v.cerrado) { salida[dia] = { cerrado: true }; continue; }
    salida[dia] = { cerrado: false, abre: texto(v.abre, 5), cierra: texto(v.cierra, 5) };
  }
  return salida;
}

/**
 * Toma cualquier objeto —de la base, del asistente de alta, de una semilla—
 * y devuelve un perfil completo y seguro de usar. Nunca lanza: un campo raro
 * se descarta, no tumba la conversación de nadie.
 */
export function normalizarPerfil(crudo = {}) {
  const c = objeto(crudo);
  const identidad = { ...NEUTRO.identidad, ...objeto(c.identidad || c.marca) };

  return {
    // ── quién es ──
    id: c.id ?? null,
    slug: aSlug(c.slug || c.nombre) || 'negocio',
    nombre: texto(c.nombre, 120) || NEUTRO.nombre,
    categoria: texto(c.categoria, 80),          // libre, puede ir vacío
    descripcion: texto(c.descripcion, 1000),
    idioma: IDIOMAS.includes(c.idioma) ? c.idioma : 'es-MX',
    zonaHoraria: texto(c.zonaHoraria, 60) || 'America/Mexico_City',

    // ── cómo se ve y cómo habla ──
    identidad,
    tono: texto(c.tono, 800) || NEUTRO.tono,
    objetivos: lista(c.objetivos).map(o => texto(o, 200)).slice(0, 8),
    saludo: texto(c.saludo, 300) || NEUTRO.saludo,
    sugerencias: lista(c.sugerencias).map(s => texto(s, 60)).slice(0, 3),
    descargo: texto(c.descargo, 300),

    // ── dónde y cuándo ──
    canales: lista(c.canales).map(x => texto(x, 30)),
    horarios: normalizarHorario(objeto(c.horarios)),
    // Cuánto dura una cita, en minutos. Manda el tamaño de los huecos que
    // ofrece la agenda: 40 minutos con huecos de 30 empalma citas.
    duracionCita: Number(c.duracionCita) > 0 ? Number(c.duracionCita) : 30,
    ubicaciones: lista(c.ubicaciones).slice(0, 12).map(u => ({
      nombre: texto(u.nombre, 120),
      direccion: texto(u.direccion, 300),
      referencias: texto(u.referencias, 300),
      mapa: texto(u.mapa, 400),
    })),
    // Públicos: son los que el visitante puede usar para escribir o llamar.
    contactos: objeto(c.contactos),

    // ── qué ofrece ──
    catalogo: lista(c.catalogo).slice(0, 200).map(normalizarOferta),
    // Lo que no cupo en ningún campo. Existe para que nadie tenga que pedir
    // una columna nueva por una particularidad de su negocio.
    atributos: objeto(c.atributos),
    conocimiento: lista(c.conocimiento).slice(0, 300).map(k => ({
      tema: texto(k.tema, 80) || 'general',
      texto: texto(k.texto, 2000),
    })),

    // ── qué puede hacer y qué no ──
    acciones: lista(c.acciones).map(a => texto(a, 40)),
    limites: lista(c.limites).map(l => texto(l, 300)).slice(0, 20),
    // Módulos que se activan A PROPÓSITO. Vacío por omisión, siempre.
    politicas: lista(c.politicas).map(p => texto(p, 40)),
    escalamiento: {
      activo: objeto(c.escalamiento).activo !== false,
      tras: Number(objeto(c.escalamiento).tras) || 2,
      mensaje: texto(objeto(c.escalamiento).mensaje, 300)
               || '¿Prefieres que te atienda una persona?',
      fueraDeHorario: texto(objeto(c.escalamiento).fueraDeHorario, 300),
    },

    // ── captura de contacto ──
    captura: objeto(c.captura).activa
      ? {
          activa: true,
          titulo: texto(objeto(c.captura).titulo, 80) || 'Dejar mis datos',
          campos: lista(objeto(c.captura).campos).slice(0, 8),
          confirmacion: texto(objeto(c.captura).confirmacion, 300)
                        || 'Gracias, ya quedaron tus datos. Te contactamos pronto.',
        }
      : { activa: false, titulo: '', campos: [], confirmacion: '' },

    // ── operación ──
    plan: ['prueba', 'basico', 'pro'].includes(c.plan) ? c.plan : 'prueba',
    estado: ['borrador', 'publicado', 'suspendido'].includes(c.estado) ? c.estado : 'borrador',
    proveedores: lista(c.proveedores).map(p => texto(p, 20)),
    ejemplo: c.ejemplo === true,     // marca de semilla borrable
  };
}

/**
 * Lo único que el navegador tiene derecho a ver. Deliberadamente NO incluye
 * tono, conocimiento, límites ni llaves: el prompt es el trabajo real del
 * producto, y quien lo lea puede estudiar cómo saltarse sus límites.
 */
export function perfilPublico(perfil) {
  const p = normalizarPerfil(perfil);
  return {
    id: p.id,
    slug: p.slug,
    nombre: p.nombre,
    categoria: p.categoria,
    idioma: p.idioma,
    marca: p.identidad,          // el widget lo sigue leyendo con este nombre
    identidad: p.identidad,
    saludo: p.saludo,
    sugerencias: p.sugerencias,
    descargo: p.descargo,
    captura: p.captura,
    contactos: p.contactos,
    acciones: p.acciones,
  };
}

/**
 * Revisa si el perfil está listo para publicarse. Devuelve una lista de
 * pendientes, no un booleano: "no está listo" sin decir por qué obliga a
 * adivinar, y quien administra no es programador.
 */
export function revisarPerfil(perfil) {
  const p = normalizarPerfil(perfil);
  const faltan = [];

  if (!p.nombre || p.nombre === NEUTRO.nombre) {
    faltan.push({ campo: 'nombre', paso: 'basicos', que: 'Ponle nombre al negocio.' });
  }
  if (!p.slug || p.slug === 'negocio') {
    faltan.push({ campo: 'slug', paso: 'basicos', que: 'Falta el identificador corto (va en la etiqueta del sitio).' });
  }
  if (!p.descripcion) {
    faltan.push({ campo: 'descripcion', paso: 'basicos', que: 'Describe en una o dos frases a qué se dedica. El bot lo usa para presentarse.' });
  }
  if (!p.conocimiento.length && !p.catalogo.length) {
    faltan.push({ campo: 'conocimiento', paso: 'conocimiento', que: 'Sin catálogo ni preguntas frecuentes, el bot solo podrá decir que no sabe.' });
  }
  const sinContacto = !Object.keys(p.contactos).length;
  if (sinContacto && !p.captura.activa) {
    faltan.push({ campo: 'contactos', paso: 'comportamiento', que: 'No hay forma de que alguien llegue a ti: agrega un contacto o activa la captura de datos.' });
  }
  return { listo: faltan.length === 0, faltan };
}
