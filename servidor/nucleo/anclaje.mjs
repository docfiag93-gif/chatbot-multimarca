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

  /* Tandas MUY largas de dígitos: números de cuenta, folios, códigos.
     De 7 a 15 dígitos lo atiende la regla de teléfonos de abajo, que compara
     por dígitos y no por valor numérico. Si esta regla también los tomara,
     el mismo número saldría dos veces con criterios distintos y el numérico
     lo daría por inventado: «9616552222» y «5219616552222» son el mismo
     teléfono pero no el mismo número. */
  const digitos = t.match(/\b\d{16,}\b/g) || [];
  digitos.forEach(d => fuera.push({ tipo: 'digitos', crudo: d, valor: d }));

  /* TELÉFONOS ESCRITOS COMO LOS ESCRIBE LA GENTE.
     Este hueco se coló en producción y es el peor de todos: preguntándole
     por WhatsApp, el bot contestó «te paso el número: 55 1234 5678». Ese
     número no existe en ninguna parte — se lo inventó. Y el anclaje no lo
     vio, porque solo buscaba siete dígitos SEGUIDOS, y nadie escribe un
     teléfono así.

     Un precio inventado cuesta una aclaración. Un teléfono inventado manda
     a un paciente a llamarle a un desconocido. */
  const telefonos = t.match(/\+?\d[\d\s().-]{6,18}\d/g) || [];
  telefonos.forEach(tel => {
    const soloDigitos = tel.replace(/\D/g, '');
    // Entre 7 y 15 dígitos es lo que mide un teléfono en cualquier país.
    if (soloDigitos.length < 7 || soloDigitos.length > 15) return;
    fuera.push({ tipo: 'telefono', crudo: tel.trim(), valor: soloDigitos });
  });

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

  /* Un teléfono se compara por sus DÍGITOS, no por cómo está escrito: en el
     panel puede estar «5219616552222» y el bot decirlo «961 655 2222». Es el
     mismo número. Se acepta si el del corpus termina igual —así la lada del
     país no lo descarta— siempre con al menos 8 dígitos en común, para que
     dos números distintos no se den por buenos por coincidir en el final. */
  if (afirmacion.tipo === 'telefono') {
    const delCorpus = (corpus.match(/\+?\d[\d\s().-]{6,18}\d|\b\d{7,}\b/g) || [])
      .map(x => x.replace(/\D/g, '')).filter(x => x.length >= 7);
    return delCorpus.some(c => {
      const comun = Math.min(c.length, afirmacion.valor.length);
      if (comun < 8) return c === afirmacion.valor;
      return c.slice(-comun) === afirmacion.valor.slice(-comun);
    });
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
/**
 * ¿El bot acaba de admitir que no sabe algo?
 *
 * Hace falta porque el anclaje solo se entera cuando la IA INVENTA un dato y
 * hay que degradarla. Cuando la IA admite por su cuenta «no tengo esa
 * información», nadie lo registraba — y para quien escribe las dos cosas son
 * exactamente lo mismo: preguntó y no le contestaron.
 *
 * El efecto era doble y silencioso: la lista de «veces que el bot no supo»
 * —que es la lista de lo que le falta al negocio— venía corta desde siempre,
 * y el escalamiento tardaba de más en ofrecer una persona.
 *
 * ── SOBRE MIRAR EL TEXTO ──
 * Sí, esto es buscar frases en la salida de un modelo, y eso es frágil por
 * naturaleza. Se hace igual por dos razones: el patrón vive AQUÍ, donde se
 * puede probar contra casos reales, y equivocarse sale barato en las dos
 * direcciones —de más, ofrece un humano que no hacía falta; de menos, deja
 * las cosas como estaban—. Ninguna de las dos le da un dato falso a nadie,
 * que es lo único que este archivo existe para impedir.
 */
const NO_SABE = [
  /\bno tengo (?:ese|esa|el|la|los|las|un|una)?\s*(?:dato|informaci[óo]n|precio|horario|detalle)/i,
  /\bno (?:cuento|dispongo) con (?:ese|esa|esa informaci[óo]n|el dato)/i,
  /\bno (?:lo|la|los|las)? ?s[ée] con (?:certeza|exactitud)/i,
  /\bno (?:tengo|hay) (?:esa|la) informaci[óo]n\b/i,
  /\bprefiero no (?:darte|decirte|inventar)/i,
  /\bno (?:puedo|podr[íi]a) confirmarte?\b/i,
  /\bno (?:me )?aparece (?:ese|esa|el|la)\b/i,
  /\bno (?:viene|est[áa]) (?:cargad[oa]|en mi informaci[óo]n)\b/i,
];

/* Frases que SUENAN a ignorancia y no lo son. Van primero porque el costo de
   confundirlas es real: «no tengo lugar el jueves» es una respuesta completa
   y útil, y contarla como un hueco del negocio ensuciaría la única lista que
   de verdad le dice al dueño qué le falta cargar. */
const SÍ_SABE = [
  /\bno tengo (?:lugar|cupo|espacio|disponibilidad|citas? disponibles?)/i,
  /\bno (?:tenemos|hay) (?:ese|esa|ese servicio|disponibilidad)\b/i,
  /\bno atendemos\b/i,
  /\bno manejamos\b/i,
];

export function admiteNoSaber(texto) {
  const t = String(texto || '');
  if (!t.trim()) return false;
  if (SÍ_SABE.some(r => r.test(t))) return false;
  return NO_SABE.some(r => r.test(t));
}

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


/* ══════════════════════════════════════════════════════════════════════
   PULIR LA RESPUESTA  ·  lo que se hace con lo que el modelo contestó

   Existe por dos defectos que estaban a la vista y nadie veía:

   1. `revisarRedaccion` medía y no hacía nada. Detectaba que la respuesta
      venía larga o con tres preguntas encimadas, lo apuntaba en un campo
      `redaccion: 'floja'` que nadie leía, y la mandaba igual. Medir sin
      actuar es el equivalente a una alarma desconectada — y ese era
      exactamente el «se aloca al contestar» del que se quejó Fernando.

   2. La web y WhatsApp ya habían empezado a separarse: la web limpiaba
      muletillas y revisaba redacción, WhatsApp solo lo primero. Dos
      canales con distinto criterio es como acaban diciendo cosas
      distintas.

   Así que el pulido vive AQUÍ, en un solo lugar, y los dos canales llaman
   a lo mismo.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Corta un texto largo por la última frase completa que quepa.
 *
 * Nunca a media palabra ni a media frase: una respuesta cortada con «…»
 * se lee como si el bot se hubiera caído, y eso preocupa más que un
 * párrafo de sobra.
 */
export function recortarAFrases(texto, maxPalabras) {
  const frases = String(texto).split(/(?<=[.!?])\s+/);
  const salida = [];
  let cuenta = 0;

  for (const f of frases) {
    const n = f.trim().split(/\s+/).filter(Boolean).length;
    // Siempre entra al menos una frase, aunque ella sola pase del límite:
    // devolver vacío sería peor que devolver de más.
    if (salida.length && cuenta + n > maxPalabras) break;
    salida.push(f.trim());
    cuenta += n;
  }
  return salida.join(' ');
}

/**
 * Deja UNA sola pregunta: la última.
 *
 * Un bot que remata con «¿te agendo? ¿o prefieres llamar? ¿qué día te
 * queda?» obliga a elegir entre tres cosas a la vez, y lo normal es que
 * la persona no conteste ninguna. La última suele ser la que cierra.
 */
export function unaSolaPregunta(texto) {
  const frases = String(texto).split(/(?<=[.!?])\s+/).map(f => f.trim()).filter(Boolean);
  const conPregunta = frases.filter(f => f.includes('?'));
  if (conPregunta.length <= 1) return frases.join(' ');

  const ultima = conPregunta[conPregunta.length - 1];
  return frases.filter(f => !f.includes('?') || f === ultima).join(' ');
}

/**
 * El pulido completo, en el orden que importa.
 *
 * Las muletillas primero: quitarlas cambia el número de palabras, así que
 * medir antes de limpiarlas daría un largo que no es el real.
 */
export function pulir(texto, { maxPalabras = 90 } = {}) {
  let t = limpiarMuletillas(String(texto || '')).trim();
  const antes = revisarRedaccion(t, { maxPalabras });
  const arreglos = [];

  if (antes.muchasPreguntas) { t = unaSolaPregunta(t); arreglos.push('preguntas'); }
  if (revisarRedaccion(t, { maxPalabras }).largo) {
    t = recortarAFrases(t, maxPalabras); arreglos.push('largo');
  }
  if (antes.muletillas) arreglos.push('muletillas');

  return { texto: t.trim(), arreglos, antes };
}
