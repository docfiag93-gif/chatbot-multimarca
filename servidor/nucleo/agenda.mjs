// ════════════════════════════════════════════════════════════════════════
//  AGENDA  ·  lo que convierte al bot en agente
//
//  Un chatbot contesta «sí, agendamos citas». Un agente mira la agenda,
//  dice QUÉ HORAS hay libres de verdad, y aparta una.
//
//  LA REGLA QUE ORDENA TODO: el bot APARTA, una persona CONFIRMA.
//
//  No es timidez. Apartar es reversible: si el bot se equivoca, se libera el
//  hueco y no pasó nada. Confirmar no lo es — alguien reacomodó su día. Un
//  agente que confirma solo va a confirmar mal algún día, y ese costo lo
//  paga el negocio delante de su cliente.
//
//  SIN ZONAS HORARIAS, a propósito. Día y hora se guardan como los dice el
//  negocio: «2026-08-27» y «17:00». Meter husos obligaría a convertir en los
//  dos sentidos y a saber dónde vive cada cliente. Si nadie convierte, nadie
//  se equivoca al convertir.
// ════════════════════════════════════════════════════════════════════════

const DIAS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

// Cómo se dice cada día, para hablarle a una persona y no a un calendario.
const COMO_SE_DICE = {
  domingo:'domingo', lunes:'lunes', martes:'martes', miercoles:'miércoles',
  jueves:'jueves', viernes:'viernes', sabado:'sábado',
};

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (Number.isFinite(h) && Number.isFinite(m)) ? h * 60 + m : null;
};
const aHora = (min) =>
  String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

/** El día en formato ISO, sin que la zona del servidor lo corra un día. */
function isoDe(fecha) {
  return fecha.getFullYear() + '-' +
         String(fecha.getMonth() + 1).padStart(2, '0') + '-' +
         String(fecha.getDate()).padStart(2, '0');
}

/**
 * Los huecos libres de los próximos días.
 *
 * @param horarios  { lunes: {abre:'16:00', cierra:'20:00'}, domingo:{cerrado:true} }
 * @param ocupados  [{ dia:'2026-08-27', hora:'17:00' }]
 */
export function huecosLibres({ horarios = {}, ocupados = [], duracion = 30,
                               dias = 7, desde = new Date(), maximo = 30 } = {}) {
  const tomados = new Set(ocupados.map(o => o.dia + ' ' + o.hora));
  const libres = [];

  for (let d = 0; d < dias && libres.length < maximo; d++) {
    const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + d);
    const nombre = DIAS[fecha.getDay()];
    const franja = horarios[nombre];
    if (!franja || franja.cerrado) continue;

    const abre = aMinutos(franja.abre), cierra = aMinutos(franja.cierra);
    if (abre == null || cierra == null || cierra <= abre) continue;

    const iso = isoDe(fecha);
    // Hoy no se ofrece lo que ya pasó, ni la hora en curso: nadie llega en
    // cero minutos. Media hora de colchón.
    const piso = (d === 0) ? desde.getHours() * 60 + desde.getMinutes() + 30 : -1;

    for (let m = abre; m + duracion <= cierra && libres.length < maximo; m += duracion) {
      if (m <= piso) continue;
      const hora = aHora(m);
      if (tomados.has(iso + ' ' + hora)) continue;
      libres.push({ dia: iso, hora, comoSeDice: comoSeDice(fecha, hora) });
    }
  }
  return libres;
}

/** «jueves 27 a las 17:00» — como lo diría una persona. */
export function comoSeDice(fecha, hora) {
  return COMO_SE_DICE[DIAS[fecha.getDay()]] + ' ' + fecha.getDate() + ' a las ' + hora;
}

/**
 * Las tres opciones que se le ofrecen a alguien.
 *
 * TRES, no diez. Una lista larga no ayuda a decidir: paraliza. Y se reparten
 * entre días distintos cuando se puede, porque ofrecer tres huecos seguidos
 * del mismo jueves es ofrecer un solo día disfrazado de tres opciones.
 */
export function tresOpciones(libres) {
  const porDia = new Map();
  for (const h of libres) {
    if (!porDia.has(h.dia)) porDia.set(h.dia, []);
    porDia.get(h.dia).push(h);
  }

  const elegidas = [];
  for (const [, delDia] of porDia) {
    elegidas.push(delDia[0]);
    if (elegidas.length === 3) break;
  }
  // Si solo hay un día con huecos, se completan con ese mismo día.
  if (elegidas.length < 3) {
    for (const h of libres) {
      if (elegidas.length === 3) break;
      if (!elegidas.includes(h)) elegidas.push(h);
    }
  }
  return elegidas;
}

/**
 * Entiende cuál de las opciones ofrecidas eligió la persona.
 *
 * Se compara contra lo que SE OFRECIÓ, nunca contra el calendario entero. Si
 * alguien escribe «el jueves a las 5» y ese hueco no estaba entre las
 * opciones, no se aparta: quizá ya lo tomaron mientras escribía.
 */
export function cualEligio(texto, opciones) {
  const t = String(texto || '').toLowerCase().trim();
  if (!t) return null;

  // Coincidencia exacta con la frase ofrecida (es lo que manda el botón).
  const exacta = opciones.find(o => t.includes(o.comoSeDice.toLowerCase()));
  if (exacta) return exacta;

  // Escrito a mano: basta con la hora si es la única con esa hora.
  const horas = opciones.filter(o => t.includes(o.hora));
  if (horas.length === 1) return horas[0];

  return null;
}
