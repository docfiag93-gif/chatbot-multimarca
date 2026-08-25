/* ══════════════════════════════════════════════════════════════════════
   EL TURNO QUE NADIE CUBRE

   La semana tiene 168 horas. Un consultorio abre cuarenta y tantas. Las
   otras ciento veinte y pico, alguien pregunta un precio y nadie contesta.

   Vive en `publico/cerebro/` y no en el servidor por dos razones, y las dos
   importan:

   · Lo usa la PORTADA, que corre en el navegador. `servidor/` no es
     alcanzable desde ahí: la raíz del sitio es `publico/`.
   · Y porque este número es el argumento de venta del producto. Escrito a
     mano en un HTML sería una promesa; calculado del horario que el propio
     negocio cargó, es un hecho — y se puede probar.
   ══════════════════════════════════════════════════════════════════════ */

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
export const HORAS_DE_LA_SEMANA = 168;

const aMinutos = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]), n = Number(m[2]);
  return (h <= 24 && n <= 59) ? h * 60 + n : null;
};

/**
 * Cuántas horas a la semana hay alguien, y cuántas no.
 *
 * Un horario que cruza la medianoche —una farmacia de guardia, un servicio
 * nocturno— se cuenta entero: son horas cubiertas aunque el reloj dé la
 * vuelta. Un día ilegible o al revés se cuenta como CERO en vez de tumbar la
 * cuenta entera: es preferible un número conservador a una página que no
 * carga.
 */
export function turnoSinCubrir(horarios = {}) {
  let abiertas = 0;
  const dias = [];

  for (const dia of DIAS) {
    const f = horarios?.[dia];
    let h = 0;
    if (f && !f.cerrado) {
      const a = aMinutos(f.abre), c = aMinutos(f.cierra);
      if (a != null && c != null && a !== c) {
        h = (c > a ? c - a : (1440 - a) + c) / 60;
      }
    }
    dias.push({ dia, horas: Math.round(h * 10) / 10, abre: f?.cerrado ? null : f?.abre ?? null,
                cierra: f?.cerrado ? null : f?.cierra ?? null });
    abiertas += h;
  }

  abiertas = Math.min(HORAS_DE_LA_SEMANA, Math.round(abiertas * 10) / 10);

  return {
    abiertas,
    solo: Math.round((HORAS_DE_LA_SEMANA - abiertas) * 10) / 10,
    total: HORAS_DE_LA_SEMANA,
    porciento: Math.round((abiertas / HORAS_DE_LA_SEMANA) * 100),
    dias,
    // Sin horarios cargados no hay resta que hacer, y decir «168 horas solo»
    // sería vender con un dato que el negocio nunca dio.
    sinDatos: abiertas === 0,
  };
}

/**
 * Las 168 celdas, en orden: siete días de veinticuatro horas.
 * `true` = hay alguien. Sirve para dibujar la rejilla sin repetir la lógica
 * de los horarios en el HTML.
 */
export function rejillaDeLaSemana(horarios = {}) {
  return DIAS.map(dia => {
    const f = horarios?.[dia];
    const celdas = new Array(24).fill(false);
    if (!f || f.cerrado) return { dia, celdas };
    const a = aMinutos(f.abre), c = aMinutos(f.cierra);
    if (a == null || c == null || a === c) return { dia, celdas };
    for (let h = 0; h < 24; h++) {
      const ini = h * 60, fin = ini + 60;
      // Se pinta la hora si se ENCIMA con la franja, no si empieza dentro:
      // un horario de 15:30 a 21:00 cubre parte de las tres de la tarde.
      celdas[h] = c > a
        ? (ini < c && fin > a)
        : (ini < c || fin > a);          // cruza la medianoche
    }
    return { dia, celdas };
  });
}

/**
 * Cuántas de esas conversaciones llegaron con el negocio CERRADO.
 *
 * La portada dice «134 horas nadie contesta» como argumento. Esto lo dice
 * como hecho consumado, con los datos del propio negocio: no «podrías estar
 * perdiendo clientes», sino «doce personas te escribieron cuando estabas
 * cerrado y tu bot las atendió».
 *
 * Es la misma frase en los dos lados de la venta: antes de comprar es una
 * promesa, después es un recibo.
 *
 * `fechas` son instantes ISO tal como los guarda la base. Se traducen a la
 * hora de pared del negocio antes de comparar: una conversación de las 23:00
 * en Tuxtla llega a la base como las 05:00 del día siguiente en UTC, y
 * compararla sin traducir la contaría en el día equivocado.
 */
export function cuantasFueraDeHorario(fechas, horarios = {}, zonaHoraria = 'America/Mexico_City') {
  const rejilla = rejillaDeLaSemana(horarios);
  // Sin horarios cargados no se puede saber qué es «fuera»: se devuelve nulo
  // en vez de cero. Cero diría «no pasó nunca», y lo cierto es «no se sabe».
  if (!rejilla.some(d => d.celdas.some(Boolean))) return null;

  const porDia = Object.fromEntries(rejilla.map(d => [d.dia, d.celdas]));
  let fuera = 0, dentro = 0;

  for (const f of (Array.isArray(fechas) ? fechas : [])) {
    const d = new Date(f);
    if (isNaN(d)) continue;
    let p;
    try {
      p = new Intl.DateTimeFormat('en-CA', {
        timeZone: zonaHoraria, hour12: false, weekday: 'long', hour: '2-digit',
      }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    } catch (e) { continue; }

    const DIA = { monday:'lunes', tuesday:'martes', wednesday:'miercoles',
                  thursday:'jueves', friday:'viernes', saturday:'sabado', sunday:'domingo' };
    const dia = DIA[String(p.weekday || '').toLowerCase()];
    const h = Number(p.hour === '24' ? '00' : p.hour);
    if (!dia || !Number.isFinite(h)) continue;

    (porDia[dia]?.[h] ? () => dentro++ : () => fuera++)();
  }

  const total = fuera + dentro;
  return { fuera, dentro, total, porciento: total ? Math.round((fuera / total) * 100) : 0 };
}
