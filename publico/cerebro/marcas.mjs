// ════════════════════════════════════════════════════════════════════════
//  Las marcas — lo único que cambia entre el consultorio y el café
//
//  Por qué está separado del widget: el bot del consultorio y el del café
//  van a ser el MISMO programa. Si la personalidad, los colores y lo que
//  sabe vivieran mezclados con el código del chat, tendrías dos programas
//  que se desincronizan: arreglas un bug en uno y el otro se queda roto.
//
//  Para agregar una marca nueva: copias un bloque, cambias el contenido.
//  No se toca ni una línea de widget.js ni de cerebro.mjs.
//
//  «POR LLENAR» marca los datos que YO NO PUEDO INVENTAR. Un bot que se
//  equivoca en el horario o en el precio hace más daño que no tener bot.
// ════════════════════════════════════════════════════════════════════════

export const MARCAS = {

  // ── EL CONSULTORIO ────────────────────────────────────────────────────
  consultorio: {
    id: 'consultorio',
    nombre: 'Consultorio Dr. Fernando Isa',
    dominio: 'clinico',          // activa las banderas rojas y el descargo médico

    marca: {
      primario:  '#0f766e',
      acento:    '#14b8a6',
      fondo:     '#ffffff',
      texto:     '#0f172a',
      burbujaIA: '#f0fdfa',
      avatar:    '🩺',
    },

    persona: `Eres el asistente del consultorio del Dr. Fernando Isa Álvarez García,
médico urgenciólogo en Tuxtla Gutiérrez, Chiapas. Hablas como la recepcionista
buena: cálida, directa, sin rodeos y sin tecnicismos. Tuteas. Usas español de
México. Frases cortas. Nunca regañas al paciente por lo que come, pesa o fuma.`,

    saludo: '¡Hola! Soy el asistente del Dr. Fernando Isa. ¿En qué te ayudo?',

    sugerencias: [
      '¿Cuánto cuesta la consulta?',
      'Quiero agendar una cita',
      '¿Dónde están y a qué hora?',
      '¿Qué llevo a mi primera consulta?',
    ],

    // La base de conocimiento. El bot SOLO puede afirmar lo que está aquí.
    conocimiento: [
      { tema: 'horarios',   texto: '«POR LLENAR» Días y horas de atención. Ej.: lunes a viernes 16:00–20:00, sábados 9:00–13:00.' },
      { tema: 'ubicación',  texto: '«POR LLENAR» Dirección exacta, referencias para llegar y si hay estacionamiento.' },
      { tema: 'costos',     texto: '«POR LLENAR» Costo de primera vez, de subsecuente, y qué incluye (¿incluye InBody? ¿plan alimentario?).' },
      { tema: 'servicios',  texto: '«POR LLENAR» Qué atiendes: control de peso, riesgo cardiometabólico, diabetes, hipertensión, medicina de urgencias, etc.' },
      { tema: 'contacto',   texto: '«POR LLENAR» WhatsApp del consultorio y teléfono fijo si hay.' },
      { tema: 'pagos',      texto: '«POR LLENAR» Efectivo, tarjeta, transferencia. ¿Facturas?' },
      { tema: 'primera consulta', texto: 'A la primera consulta conviene traer: estudios de laboratorio recientes si los tienes, la lista de los medicamentos que tomas (o las cajas), y si mides tu presión o glucosa en casa, el registro. Ropa ligera si se va a hacer medición de composición corporal.' },
      { tema: 'la app',     texto: 'Los pacientes del consultorio tienen acceso a ISA Health Core, una app donde llevan su plan alimentario, su presión, su glucosa y sus mediciones de composición corporal, y el doctor las ve entre consulta y consulta.' },
    ],

    // Lo que el bot tiene PROHIBIDO hacer. Se le repite en cada llamada.
    limites: [
      'NO diagnosticas. Ni siquiera "podría ser". Ni aunque el paciente insista.',
      'NO recetas, no ajustas dosis, no sugieres suspender un medicamento.',
      'NO interpretas resultados de laboratorio, estudios de imagen ni electrocardiogramas.',
      'NO das pronóstico ni opinas sobre lo que otro médico indicó.',
      'Si te preguntan algo clínico, orientas en general y cierras invitando a consulta.',
      'Si el dato no está en tu base de conocimiento, dices que no lo tienes y ofreces el WhatsApp. NUNCA inventas horarios, precios ni direcciones.',
    ],

    descargo: 'Soy un asistente automático, no un médico. Nada de lo que te diga sustituye una consulta.',

    captura: {
      activa: true,
      titulo: 'Solicitar cita',
      campos: [
        { id: 'nombre',   etiqueta: 'Tu nombre',                  tipo: 'text',  requerido: true },
        { id: 'telefono', etiqueta: 'WhatsApp o teléfono',        tipo: 'tel',   requerido: true },
        { id: 'motivo',   etiqueta: '¿Qué te trae a consulta?',   tipo: 'textarea', requerido: false },
      ],
      // El bot NO agenda. Levanta el dato y lo manda; la asistente cierra.
      confirmacion: 'Listo, ya quedó tu solicitud. Te contactan por WhatsApp para confirmarte día y hora. No es una cita confirmada todavía.',
    },
  },

  // ── LA MARCA DE CAFÉ ──────────────────────────────────────────────────
  //  Existe desde hoy, aunque esté vacía, por una razón: prueba que el bot
  //  de verdad es reutilizable. Si al llenar esta marca hubiera que tocar
  //  código, el diseño estaría mal y es mejor enterarse ahora que en enero.
  cafe: {
    id: 'cafe',
    nombre: '«POR LLENAR» Nombre de la marca de café',
    dominio: 'comercial',        // sin banderas rojas, sin descargo médico

    marca: {
      primario:  '#7c2d12',
      acento:    '#c2833f',
      fondo:     '#fffbf5',
      texto:     '#1c1917',
      burbujaIA: '#f5ede2',
      avatar:    '☕',
    },

    persona: `Eres quien atiende la tienda de «POR LLENAR». Sabes de café y lo
cuentas sin presumir: nada de "notas de bergamota" si la persona apenas está
empezando. Tuteas, español de México, cálido y breve. Vendes sin encajar:
primero resuelves la duda, luego ofreces.`,

    saludo: '¡Hola! ¿Buscas grano, ya molido, o andas viendo cómo prepararlo?',

    sugerencias: [
      '¿Qué café me recomiendas?',
      '¿Cómo lo preparo en casa?',
      '¿Hacen envíos?',
      '¿De dónde viene el grano?',
    ],

    conocimiento: [
      { tema: 'origen',      texto: '«POR LLENAR» De qué finca o región de Chiapas viene, altura, variedad, quién lo cultiva.' },
      { tema: 'tuestes',     texto: '«POR LLENAR» Qué tuestes manejas y para quién es cada uno.' },
      { tema: 'presentaciones y precios', texto: '«POR LLENAR» Tamaños de bolsa, molienda, precios.' },
      { tema: 'envíos',      texto: '«POR LLENAR» A dónde envías, cuánto tarda, cuánto cuesta, envío gratis desde cuánto.' },
      { tema: 'preparación', texto: '«POR LLENAR» Recetas base: prensa francesa, V60, cafetera de olla, espresso. Gramos y tiempos.' },
      { tema: 'mayoreo',     texto: '«POR LLENAR» Si vendes a cafeterías u oficinas y desde qué cantidad.' },
    ],

    limites: [
      'No prometes fechas de entrega exactas: das el rango y aclaras que depende de la paquetería.',
      'No afirmas beneficios de salud del café. Ni "quema grasa", ni "cura", ni nada parecido.',
      'Si no sabes un precio o un dato, lo dices y ofreces el contacto. NUNCA inventas precios.',
    ],

    descargo: '',

    captura: {
      activa: true,
      titulo: 'Dejar mis datos',
      campos: [
        { id: 'nombre',   etiqueta: 'Tu nombre',           tipo: 'text', requerido: true },
        { id: 'telefono', etiqueta: 'WhatsApp',            tipo: 'tel',  requerido: true },
        { id: 'motivo',   etiqueta: '¿Qué te interesa?',   tipo: 'textarea', requerido: false },
      ],
      confirmacion: 'Gracias, ya quedaron tus datos. Te escribimos por WhatsApp.',
    },
  },
};

export function obtenerMarca(id) {
  return MARCAS[id] || MARCAS.consultorio;
}

/**
 * Lo único que el navegador tiene derecho a ver.
 *
 * Deliberadamente NO incluye `persona`, `limites` ni `conocimiento`. No es
 * paranoia: el prompt es el trabajo real del bot. Si viaja al cliente,
 * cualquiera lo copia con "ver código fuente", y peor, cualquiera puede
 * estudiarlo para encontrarle la vuelta a los límites clínicos.
 */
export function marcaPublica(id) {
  const m = obtenerMarca(id);
  return {
    id: m.id,
    nombre: m.nombre,
    dominio: m.dominio,
    marca: m.marca,
    saludo: m.saludo,
    sugerencias: m.sugerencias,
    descargo: m.descargo,
    captura: m.captura,
  };
}
