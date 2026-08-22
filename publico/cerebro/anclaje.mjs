// ════════════════════════════════════════════════════════════════════════
//  Anclaje — que el bot no invente datos duros
//
//  EL PROBLEMA QUE RESUELVE
//  Un modelo de lenguaje contesta siempre. Si no sabe el horario, se lo
//  inventa con total naturalidad: "abrimos de 9 a 6" suena idéntico venga de
//  la base de conocimiento o de la nada. El resultado es alguien parado
//  frente a una cortina cerrada un domingo.
//
//  Pedirlo en el prompt ayuda, pero no basta: el prompt es una petición, no
//  una garantía. Esto es la garantía.
//
//  CÓMO FUNCIONA
//  Después de que el modelo responde, se extraen los DATOS DUROS de su
//  respuesta —precios, horas, días, teléfonos, porcentajes— y se comprueba
//  que cada uno aparezca en lo que el negocio realmente cargó. El que no
//  aparezca está inventado.
//
//  QUÉ *NO* HACE, A PROPÓSITO
//  No revisa afirmaciones generales ("somos rápidos", "el envío es sencillo").
//  Solo datos verificables. Un verificador que bloquea lenguaje normal
//  convierte al bot en un robot inútil, y entonces alguien lo apaga.
//
//  Tampoco corrige: si detecta invención, degrada la respuesta a una que
//  admite no saber. Inventar una corrección sería el mismo error otra vez.
// ════════════════════════════════════════════════════════════════════════

const DIAS = ['lunes','martes','miercoles','miércoles','jueves','viernes','sabado','sábado','domingo'];

/* ── normalización ───────────────────────────────────────────────────── */

function sinAcentos(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Los números se comparan por su valor, no por cómo se escribieron:
 *  "$1,800", "1800" y "1.800" son el mismo dato. */
function normalizarNumero(txt) {
  const limpio = String(txt).replace(/[^\d.,]/g, '').replace(/,/g, '');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? String(n) : null;
}

/** Las horas se comparan en minutos: "9", "9:00", "09:00" y "9 am" coinciden. */
function normalizarHora(txt) {
  const m = String(txt).match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || '0', 10);
  const suf = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (suf === 'pm' && h < 12) h += 12;
  if (suf === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/* ── el corpus: todo lo que el negocio SÍ dijo ───────────────────────── */

/**
 * Junta en un solo texto todo lo que el negocio cargó. Contra esto se
 * verifica. Lo que no esté aquí, el bot no lo puede afirmar.
 */
export function corpusDe(perfil) {
  const p = perfil || {};
  const trozos = [];

  (p.conocimiento || []).forEach(k => trozos.push(k.tema, k.texto));
  (p.catalogo || []).forEach(o => trozos.push(o.nombre, o.descripcion, o.precio,
    ...(o.etiquetas || []), ...Object.values(o.atributos || {})));
  Object.entries(p.horarios || {}).forEach(([dia, v]) => {
    if (v && !v.cerrado) trozos.push(dia, v.abre, v.cierra);
  });
  (p.ubicaciones || []).forEach(u => trozos.push(u.nombre, u.direccion, u.referencias));
  Object.entries(p.atributos || {}).forEach(([k, v]) => trozos.push(k, String(v)));
  Object.values(p.contactos || {}).forEach(c => trozos.push(c.whatsapp, c.telefono, c.etiqueta));
  trozos.push(p.descripcion, p.nombre, p.categoria, p.saludo, p.descargo);

  return trozos.filter(Boolean).join(' \n ');
}

/* ── extracción de afirmaciones verificables ─────────────────────────── */

/**
 * Saca de un texto los datos duros que se pueden comprobar.
 * Cada uno lleva su tipo, para poder compararlo con el criterio adecuado.
 */
export function afirmacionesDe(texto) {
  const t = String(texto || '');
  const fuera = [];

  // Cantidades de dinero: $1,800 · 1800 pesos · MXN 950
  const dinero = t.match(/\$\s?[\d][\d.,]*|\b[\d][\d.,]*\s?(?:pesos|mxn|usd|dólares|dolares)\b/gi) || [];
  dinero.forEach(d => fuera.push({ tipo: 'dinero', crudo: d.trim(), valor: normalizarNumero(d) }));

  // Horas: 9:00 · 18:30 · 9 am · 6 pm
  const horas = t.match(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?)\b/gi) || [];
  horas.forEach(h => fuera.push({ tipo: 'hora', crudo: h.trim(), valor: normalizarHora(h) }));

  // Días de la semana
  const sa = sinAcentos(t);
  DIAS.forEach(d => {
    const dn = sinAcentos(d);
    if (new RegExp('\\b' + dn + '\\b').test(sa)) fuera.push({ tipo: 'dia', crudo: dn, valor: dn });
  });

  // Tandas largas de dígitos: teléfonos, códigos, números de cuenta
  const digitos = t.match(/\b\d{7,}\b/g) || [];
  digitos.forEach(d => fuera.push({ tipo: 'digitos', crudo: d, valor: d }));

  // Porcentajes
  const pct = t.match(/\b\d{1,3}\s?%/g) || [];
  pct.forEach(x => fuera.push({ tipo: 'porcentaje', crudo: x.trim(), valor: normalizarNumero(x) }));

  // Sin duplicados: repetir el mismo precio dos veces es una sola afirmación.
  const vistas = new Set();
  return fuera.filter(a => {
    const clave = a.tipo + '|' + a.valor;
    if (a.valor == null || vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/* ── verificación ────────────────────────────────────────────────────── */

function apareceEnCorpus(afirmacion, corpus) {
  const c = sinAcentos(corpus);

  if (afirmacion.tipo === 'dia') return new RegExp('\\b' + afirmacion.valor + '\\b').test(c);

  if (afirmacion.tipo === 'hora') {
    const horasCorpus = (corpus.match(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?)\b/gi) || [])
      .map(normalizarHora).filter(v => v != null);
    // También cuentan las horas escritas a secas dentro de una frase
    // ("abrimos a las 9"), que son comunes en texto redactado.
    const sueltas = (corpus.match(/\b(?:a las|de|hasta)\s+(\d{1,2})\b/gi) || [])
      .map(x => normalizarHora(x.replace(/[^\d]/g, ''))).filter(v => v != null);
    return [...horasCorpus, ...sueltas].includes(afirmacion.valor);
  }

  // dinero, dígitos y porcentaje se comparan por valor numérico
  const numerosCorpus = (corpus.match(/[\d][\d.,]*/g) || []).map(normalizarNumero).filter(Boolean);
  return numerosCorpus.includes(afirmacion.valor);
}

/**
 * Revisa una respuesta contra lo que el negocio cargó.
 *
 * @returns {{anclado:boolean, inventadas:Array, revisadas:number}}
 */
export function revisarAnclaje(perfil, respuesta) {
  const corpus = corpusDe(perfil);
  const afirmaciones = afirmacionesDe(respuesta);
  const inventadas = afirmaciones.filter(a => !apareceEnCorpus(a, corpus));
  return { anclado: inventadas.length === 0, inventadas, revisadas: afirmaciones.length };
}

/* ── otros vicios de redacción ───────────────────────────────────────── */

const MULETILLAS = [
  /como (?:un )?(?:asistente|modelo) de (?:ia|inteligencia artificial)/i,
  /soy una inteligencia artificial/i,
  /estoy (?:aquí|aqui) para ayudarte/i,
  /no dudes en (?:preguntar|consultar)/i,
  /espero (?:que )?(?:esto |esta información )?(?:te )?(?:sea|haya sido) (?:de ayuda|útil)/i,
  /¡?claro que sí!?,? (?:con gusto|por supuesto)/i,
];

/**
 * Los tics que hacen que una respuesta suene a robot de manual.
 * Se detectan aparte del anclaje porque no son mentiras: son ruido.
 */
export function revisarRedaccion(texto, { maxPalabras = 90 } = {}) {
  const t = String(texto || '');
  const palabras = t.trim().split(/\s+/).filter(Boolean).length;
  const preguntas = (t.match(/\?/g) || []).length;

  return {
    palabras,
    largo: palabras > maxPalabras,
    muchasPreguntas: preguntas > 1,
    muletillas: MULETILLAS.filter(r => r.test(t)).length,
  };
}

/** Quita las muletillas sin tocar el resto de la frase. */
export function limpiarMuletillas(texto) {
  let t = String(texto || '');
  MULETILLAS.forEach(r => { t = t.replace(r, ''); });
  return t.replace(/\s{2,}/g, ' ').replace(/^\s*[,.;:]\s*/, '').trim();
}

/**
 * La respuesta que se da cuando el modelo inventó un dato.
 *
 * NO se intenta corregir el dato: corregir con otro dato inventado es el
 * mismo error. Se admite el hueco y se ofrece a una persona, que es
 * exactamente lo que haría un empleado honesto que no se sabe el precio.
 */
export function respuestaSinDato(perfil, inventadas) {
  const tipos = new Set(inventadas.map(i => i.tipo));
  let que = 'ese dato';
  if (tipos.has('dinero')) que = 'el precio exacto';
  else if (tipos.has('hora') || tipos.has('dia')) que = 'el horario exacto';
  else if (tipos.has('digitos')) que = 'ese número';

  const hayContacto = Object.keys(perfil?.contactos || {}).length > 0;
  return {
    texto: `No tengo ${que} a la mano y prefiero no darte uno equivocado. ` +
           (hayContacto ? 'Te paso con alguien que sí lo tiene.'
                        : 'Déjame tus datos y te confirmamos.'),
    sugerencias: [],
    accion: hayContacto ? 'derivar_humano' : 'capturar_contacto',
  };
}
