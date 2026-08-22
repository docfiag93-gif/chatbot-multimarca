// ════════════════════════════════════════════════════════════════════════
//  Acciones — qué puede HACER el bot, según el negocio
//
//  El problema que resuelve: antes el bot solo sabía "capturar_cita", porque
//  el único negocio imaginado era uno que agenda. Una tienda que vende, un
//  proveedor que cotiza y un restaurante que aparta mesa hacen cosas
//  distintas, y ninguna cabía.
//
//  Aquí cada acción es una entrada del catálogo. Un negocio enciende las que
//  le sirven y el resto no existen para él: no aparecen en su prompt, y si el
//  modelo devolviera una que no está encendida, se descarta.
//
//  Agregar una acción nueva es agregar una entrada aquí. Ni el widget ni el
//  servidor tienen que enterarse.
// ════════════════════════════════════════════════════════════════════════

export const ACCIONES = {

  mostrar_catalogo: {
    nombre: 'Mostrar lo que ofrece',
    resumen: 'Responde con productos, servicios o espacios del catálogo.',
    cuando: 'la persona pregunta qué hay, qué venden, qué servicios dan o pide ver opciones',
    // Sin catálogo cargado, ofrecerla sería prometer algo que no existe.
    requiere: 'catalogo',
  },

  capturar_contacto: {
    nombre: 'Pedir datos para contactar',
    resumen: 'Abre un formulario con nombre, teléfono y motivo.',
    cuando: 'la persona quiere que le llamen, pide algo que necesita seguimiento, o el tema ya no se resuelve por chat',
    abreFormulario: true,
  },

  cotizar: {
    nombre: 'Levantar una cotización',
    resumen: 'Recoge qué necesita, cuánto y para cuándo, y lo manda a una persona.',
    cuando: 'la persona pide precio por volumen, un proyecto a la medida o condiciones especiales',
    abreFormulario: true,
  },

  reservar: {
    nombre: 'Apartar lugar',
    resumen: 'Toma los datos para apartar una mesa, un espacio o un equipo.',
    cuando: 'la persona quiere apartar lugar para una fecha y hora',
    abreFormulario: true,
  },

  agendar: {
    nombre: 'Solicitar una cita',
    resumen: 'Recoge los datos para una cita y avisa que se confirma después.',
    cuando: 'la persona quiere una cita o una visita',
    abreFormulario: true,
  },

  dar_ubicacion: {
    nombre: 'Decir dónde están',
    resumen: 'Responde con la dirección, referencias y enlace de mapa.',
    cuando: 'preguntan dónde están, cómo llegar o si hay estacionamiento',
    requiere: 'ubicaciones',
  },

  dar_horarios: {
    nombre: 'Decir a qué hora abren',
    resumen: 'Responde con los horarios cargados.',
    cuando: 'preguntan a qué hora abren, si están abiertos o si trabajan cierto día',
    requiere: 'horarios',
  },

  derivar_humano: {
    nombre: 'Pasar a una persona',
    resumen: 'Ofrece el contacto directo del negocio.',
    cuando: 'lo piden, el tema se salió de lo que sabes, o la persona está molesta',
  },
};

/** El catálogo completo para pintarlo en el panel. */
export function catalogoDeAcciones() {
  return Object.entries(ACCIONES).map(([id, a]) => ({
    id, nombre: a.nombre, resumen: a.resumen, requiere: a.requiere || null,
  }));
}

/**
 * Las acciones realmente disponibles para un negocio: las que encendió Y que
 * tienen con qué funcionar.
 *
 * Lo segundo importa: ofrecer "mostrar catálogo" con el catálogo vacío hace
 * que el bot prometa una lista que no existe, y quien pregunta se queda
 * esperando. Es mejor que esa acción simplemente no exista para ese negocio.
 */
export function accionesDisponibles(perfil) {
  const encendidas = Array.isArray(perfil?.acciones) ? perfil.acciones : [];
  const salida = [];

  for (const id of encendidas) {
    const a = ACCIONES[id];
    if (!a) continue;                                   // acción retirada: se ignora
    if (a.requiere) {
      const dato = perfil?.[a.requiere];
      const tiene = Array.isArray(dato) ? dato.length > 0
                  : dato && typeof dato === 'object' ? Object.keys(dato).length > 0
                  : !!dato;
      if (!tiene) continue;
    }
    salida.push(id);
  }

  // `derivar_humano` siempre está: la salida hacia una persona no es una
  // función opcional del producto. Un chat sin salida es una trampa.
  if (!salida.includes('derivar_humano')) salida.push('derivar_humano');
  return salida;
}

/** El trozo de prompt que le dice al modelo qué puede hacer y cuándo. */
export function fragmentoDeAcciones(perfil) {
  const ids = accionesDisponibles(perfil);
  const lineas = ids.map(id => `- "${id}": ${ACCIONES[id].cuando}`);
  return `Acciones disponibles (devuelve exactamente una en el campo "accion",
o "ninguna" si no aplica ninguna):
${lineas.join('\n')}
- "ninguna": todo lo demás.`;
}

/** ¿El negocio permite esta acción? Se usa para filtrar lo que devuelve el
 *  modelo: que la pida no significa que esté encendida. */
export function accionPermitida(perfil, id) {
  if (!id || id === 'ninguna') return true;
  return accionesDisponibles(perfil).includes(id);
}

/** ¿Esta acción abre el formulario de captura en el widget? */
export function abreFormulario(id) {
  return !!ACCIONES[id]?.abreFormulario;
}
