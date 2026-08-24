// ════════════════════════════════════════════════════════════════════════
//  El tope de mensajes: qué le toca a cada negocio y qué pasa al llegar
//
//  Hasta hoy `plan` era una etiqueta bonita en la base que no hacía nada.
//  Aquí es donde empieza a significar algo.
//
//  Lo que este archivo NO hace: contar. Contar es de la base, porque el
//  contador tiene que ser el mismo para todas las copias de la función y
//  tiene que aguantar dos mensajes simultáneos. Aquí solo se decide.
// ════════════════════════════════════════════════════════════════════════

/**
 * Cuántos mensajes al día trae cada plan.
 *
 * Los números salen de para qué sirve cada plan, no de un cálculo de costos:
 *   · prueba  — alcanza para que alguien pruebe el bot una semana con sus
 *               clientes de verdad y se convenza. No alcanza para operar.
 *   · basico  — un consultorio o un negocio de mostrador, con holgura.
 *   · pro     — varios números, o un negocio con mucho movimiento.
 *
 * Si un cliente concreto necesita más, se le pone `tope_diario` y ya. No hay
 * que inventar un plan nuevo ni tocar este archivo.
 */
export const TOPES = { prueba: 200, basico: 2000, pro: 10000 };

/** El tope que aplica de verdad: el propio si lo tiene, si no el del plan. */
export function topeDe({ plan, topeDiario } = {}) {
  const propio = Number(topeDiario);
  if (Number.isFinite(propio) && propio > 0) return Math.floor(propio);
  return TOPES[plan] ?? TOPES.prueba;
}

/**
 * Dónde va el negocio hoy.
 *
 * `avisar` se enciende UNA sola vez, al cruzar el umbral exacto. Sin eso,
 * cada mensaje a partir del 80% mandaría otro correo, y el dueño acabaría
 * mandando los avisos a la basura — que es peor que no avisarle.
 */
export function estadoDeCuota({ usados = 0, tope = TOPES.prueba } = {}) {
  const n = Math.max(0, Math.floor(Number(usados) || 0));
  const t = Math.max(1, Math.floor(Number(tope) || TOPES.prueba));
  const aviso = Math.floor(t * 0.8);
  return {
    usados: n,
    tope: t,
    restantes: Math.max(0, t - n),
    porciento: Math.min(100, Math.round((n / t) * 100)),
    excedido: n > t,
    cerca: n >= aviso && n <= t,
    // Justo al cruzar: ni antes ni en cada mensaje posterior.
    avisarCerca: n === aviso,
    avisarTope: n === t + 1,
  };
}

/**
 * Qué contesta el bot cuando el negocio ya gastó su día.
 *
 * NO se reusa el texto del modo «recados» a propósito. Ese dice «ahorita te
 * contesta una persona», y aquí puede que no haya nadie mirando: sería una
 * promesa que el negocio no pidió hacer. Se dice lo que es verdad —hoy ya no
 * puedo contestar— y se ofrece lo único útil que queda, que es tomarle los
 * datos para que lo busquen.
 */
export function respuestaPorTope({ marca = {} } = {}) {
  const puedeCapturar = !!marca.captura?.activa;
  return {
    texto: puedeCapturar
      ? 'Por hoy ya no puedo seguir contestando aquí. Déjame tu nombre y tu teléfono y te buscamos.'
      : 'Por hoy ya no puedo seguir contestando aquí. Vuelve mañana, por favor.',
    sugerencias: [],
    accion: puedeCapturar ? 'capturar_contacto' : 'ninguna',
    via: 'tope', corte: 'tope',
  };
}
