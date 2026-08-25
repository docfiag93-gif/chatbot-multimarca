// ════════════════════════════════════════════════════════════════════════
//  Cuándo dejar de insistir y ofrecer una persona
//
//  Un bot que contesta «no tengo ese dato» tres veces seguidas no está
//  siendo prudente: está gastándole el tiempo a alguien que ya entendió que
//  aquí no va a encontrar lo que busca. La tercera vez, quien escribe no
//  vuelve a preguntar — se va.
//
//  Esto lleva especificado en el perfil desde el primer día (`escalamiento`,
//  con su `tras: 2`) y nunca se construyó. Era una promesa escrita en el
//  modelo de datos.
//
//  Lo que NO hace: contar. Contar es de la base, porque los fallos previos
//  viven en las conversaciones de esa misma sesión. Aquí solo se decide.
// ════════════════════════════════════════════════════════════════════════

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/**
 * ¿Está abierto el negocio ahora mismo?
 *
 * Devuelve null cuando NO SE SABE —sin horarios cargados, o con un horario
 * ilegible— y eso es distinto de «está cerrado». La diferencia importa: si
 * no se sabe, no se le dice a nadie «ahorita no hay quien te atienda», que
 * es una afirmación sobre el negocio de otro. Ante la duda, se calla.
 */
export function abiertoAhora(horarios, ahora = new Date()) {
  if (!horarios || typeof horarios !== 'object') return null;

  const dia = DIAS[(ahora.getDay() + 6) % 7];      // getDay(): 0 = domingo
  const hoy = horarios[dia];
  if (!hoy) return null;
  if (hoy.cerrado) return false;

  const min = t => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
    if (!m) return null;
    const h = Number(m[1]), n = Number(m[2]);
    if (h > 23 || n > 59) return null;
    return h * 60 + n;
  };

  const abre = min(hoy.abre), cierra = min(hoy.cierra);
  if (abre === null || cierra === null) return null;

  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  // Un horario que cruza la medianoche (22:00–02:00) es raro pero existe:
  // bares, farmacias de guardia, servicios nocturnos.
  return cierra > abre
    ? ahoraMin >= abre && ahoraMin < cierra
    : ahoraMin >= abre || ahoraMin < cierra;
}

/**
 * ¿Toca ofrecer una persona?
 *
 * `fallosPrevios` son las veces ANTERIORES en esta misma conversación en que
 * el bot tuvo que admitir que no tenía el dato. La de ahora se suma aquí.
 *
 * Devuelve null si todavía no toca — y entonces el bot contesta como
 * siempre, admitiendo el hueco.
 */
export function decidirEscalar({ marca = {}, fallosPrevios = 0, ahora = new Date() } = {}) {
  const e = marca.escalamiento || {};
  if (e.activo === false) return null;

  const tras = Number(e.tras) > 0 ? Math.floor(Number(e.tras)) : 2;
  const van = Math.max(0, Math.floor(Number(fallosPrevios) || 0)) + 1;
  if (van < tras) return null;

  const abierto = abiertoAhora(marca.horarios, ahora);
  const puedeCapturar = !!marca.captura?.activa;
  const hayContacto = !!(marca.contactos && Object.keys(marca.contactos).length);

  /* Cerrado y con un mensaje propio para esa hora: se usa. Es el único caso
     en que el negocio dijo explícitamente qué decir de noche.
     Si NO se sabe si está abierto, se trata como abierto: prometer de menos
     es mejor que decirle a alguien «no hay nadie» cuando sí lo hay. */
    const texto = (abierto === false && e.fueraDeHorario)
    ? e.fueraDeHorario
    : (e.mensaje || '¿Prefieres que te atienda una persona?');

  return {
    texto,
    sugerencias: [],
    accion: puedeCapturar ? 'capturar_contacto' : (hayContacto ? 'derivar_humano' : 'ninguna'),
    via: 'escalamiento',
    corte: 'escalamiento',
    // Para el panel: cuántas veces se quedó sin contestar antes de rendirse.
    tras: van,
  };
}
