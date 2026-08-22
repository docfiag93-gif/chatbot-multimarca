// ════════════════════════════════════════════════════════════════════════
//  Semillas de demostración — EJEMPLOS, NO EL PRODUCTO
//
//  Este archivo se puede BORRAR ENTERO y el sistema sigue funcionando. Todo
//  lo que hay aquí son negocios de mentira para que la consola tenga algo que
//  mostrar antes de que exista el primer cliente real.
//
//  Cada uno lleva `ejemplo: true`, que sirve para dos cosas: la consola los
//  marca como demostración, y hay una acción de "borrar ejemplos" que solo
//  toca a los que tienen esa bandera.
//
//  Son cuatro rubros distintos a propósito. Si el sistema estuviera doblado
//  hacia uno solo, se notaría aquí: alguno se vería forzado.
//
//  ⚠️ Ninguno de estos define el comportamiento del núcleo. Si algo del
//  sistema deja de funcionar al borrar este archivo, eso es un defecto.
// ════════════════════════════════════════════════════════════════════════

export const SEMILLAS = {

  /* ── 1 · Servicios profesionales con política clínica encendida ────── */
  consultorio: {
    ejemplo: true,
    slug: 'consultorio',
    nombre: 'Consultorio de ejemplo',
    categoria: 'Salud y bienestar',
    descripcion: 'Consulta médica general y control de padecimientos crónicos.',
    identidad: { primario: '#0f766e', acento: '#14b8a6', fondo: '#ffffff',
                 texto: '#0f172a', burbujaIA: '#f0fdfa', avatar: '🩺' },
    tono: 'Cálido y directo, sin tecnicismos. Tuteas. Nunca regañas a nadie por lo que come, pesa o fuma.',
    objetivos: ['Resolver dudas de logística', 'Que quien necesita consulta la agende'],
    saludo: '¡Hola! ¿En qué te ayudo?',
    sugerencias: ['¿Cuánto cuesta?', 'Quiero una cita', '¿Dónde están?'],
    // ESTA es la única marca con política clínica, y está encendida a mano.
    politicas: ['urgencias-clinicas'],
    acciones: ['agendar', 'dar_horarios', 'dar_ubicacion', 'derivar_humano'],
    descargo: 'Soy un asistente automático, no un profesional de la salud.',
    horarios: {
      lunes: { abre: '16:00', cierra: '20:00' }, martes: { abre: '16:00', cierra: '20:00' },
      miercoles: { abre: '16:00', cierra: '20:00' }, jueves: { abre: '16:00', cierra: '20:00' },
      viernes: { abre: '16:00', cierra: '20:00' }, sabado: { abre: '09:00', cierra: '13:00' },
      domingo: { cerrado: true },
    },
    conocimiento: [
      { tema: 'primera visita', texto: 'Conviene traer estudios recientes si los hay y la lista de medicamentos que se toman.' },
      { tema: 'costos', texto: 'Primera vez $800. Subsecuente $500. Efectivo, tarjeta o transferencia.' },
    ],
    captura: { activa: true, titulo: 'Solicitar cita',
      campos: [{ id: 'nombre', etiqueta: 'Tu nombre', tipo: 'text', requerido: true },
               { id: 'telefono', etiqueta: 'WhatsApp', tipo: 'tel', requerido: true },
               { id: 'motivo', etiqueta: '¿Qué te trae?', tipo: 'textarea', requerido: false }],
      confirmacion: 'Listo, ya quedó tu solicitud. Te contactan para confirmar. Todavía no es una cita confirmada.' },
  },

  /* ── 2 · Comercio con catálogo ─────────────────────────────────────── */
  cafe: {
    ejemplo: true,
    slug: 'cafe',
    nombre: 'Café de ejemplo',
    categoria: 'Restaurante y alimentos',
    descripcion: 'Café de altura tostado en lotes pequeños. Venta en grano y molido.',
    identidad: { primario: '#7c2d12', acento: '#c2833f', fondo: '#fffbf5',
                 texto: '#1c1917', burbujaIA: '#f5ede2', avatar: '☕' },
    tono: 'Sabes de café y lo cuentas sin presumir. Nada de "notas de bergamota" con quien apenas empieza.',
    objetivos: ['Resolver la duda antes de vender', 'Que la gente sepa cómo prepararlo'],
    saludo: '¡Hola! ¿Buscas grano, molido, o andas viendo cómo prepararlo?',
    sugerencias: ['¿Qué me recomiendas?', '¿Hacen envíos?', '¿Cómo lo preparo?'],
    politicas: [],                                   // ninguna: no le hace falta
    acciones: ['mostrar_catalogo', 'capturar_contacto', 'dar_horarios', 'derivar_humano'],
    catalogo: [
      { tipo: 'producto', nombre: 'Bolsa 250 g · tueste medio', precio: '$180', etiquetas: ['grano', 'molido'],
        descripcion: 'Para quien empieza. Dulce, sin acidez fuerte.' },
      { tipo: 'producto', nombre: 'Bolsa 1 kg · tueste medio', precio: '$620', etiquetas: ['grano'],
        descripcion: 'El mismo café, para quien ya lo toma diario.' },
      { tipo: 'servicio', nombre: 'Suscripción mensual', precio: 'desde $340',
        descripcion: 'Llega a tu casa cada mes. Se cancela cuando quieras.' },
    ],
    conocimiento: [
      { tema: 'envíos', texto: 'A todo el país, de 2 a 5 días hábiles. Gratis desde $600.' },
      { tema: 'origen', texto: 'Grano de altura de la sierra de Chiapas, tostado en lotes pequeños cada semana.' },
    ],
    captura: { activa: true, titulo: 'Dejar mis datos',
      campos: [{ id: 'nombre', etiqueta: 'Tu nombre', tipo: 'text', requerido: true },
               { id: 'telefono', etiqueta: 'WhatsApp', tipo: 'tel', requerido: true },
               { id: 'motivo', etiqueta: '¿Qué te interesa?', tipo: 'textarea', requerido: false }],
      confirmacion: 'Gracias, ya quedaron tus datos. Te escribimos por WhatsApp.' },
  },

  /* ── 3 · Tienda con inventario y horarios ──────────────────────────── */
  tienda: {
    ejemplo: true,
    slug: 'tienda',
    nombre: 'Tienda de ejemplo',
    categoria: 'Comercio y tienda',
    descripcion: 'Papelería y artículos de oficina. Venta en mostrador y a domicilio.',
    identidad: { primario: '#1d4ed8', acento: '#60a5fa', fondo: '#ffffff',
                 texto: '#0f172a', burbujaIA: '#eff6ff', avatar: '🛍️' },
    tono: 'Práctico y rápido. La gente quiere saber si hay, cuánto cuesta y si se lo llevan.',
    objetivos: ['Confirmar disponibilidad', 'Cerrar el pedido o dejar el contacto'],
    saludo: 'Hola, ¿qué estás buscando?',
    sugerencias: ['Ver productos', '¿Hacen entregas?', '¿A qué hora abren?'],
    politicas: ['precios-sujetos-a-cambio'],
    acciones: ['mostrar_catalogo', 'capturar_contacto', 'dar_horarios', 'dar_ubicacion', 'derivar_humano'],
    catalogo: [
      { tipo: 'producto', nombre: 'Resma de papel carta', precio: '$120', etiquetas: ['oficina'] },
      { tipo: 'producto', nombre: 'Caja de bolígrafos negros (12)', precio: '$85', etiquetas: ['escritura'] },
      { tipo: 'servicio', nombre: 'Entrega a domicilio', precio: '$40', descripcion: 'Mismo día dentro de la ciudad.' },
    ],
    horarios: {
      lunes: { abre: '09:00', cierra: '19:00' }, martes: { abre: '09:00', cierra: '19:00' },
      miercoles: { abre: '09:00', cierra: '19:00' }, jueves: { abre: '09:00', cierra: '19:00' },
      viernes: { abre: '09:00', cierra: '19:00' }, sabado: { abre: '10:00', cierra: '15:00' },
      domingo: { cerrado: true },
    },
    ubicaciones: [{ nombre: 'Sucursal centro', direccion: 'Calle de ejemplo 123',
                    referencias: 'Frente al parque' }],
    conocimiento: [{ tema: 'pagos', texto: 'Efectivo, tarjeta y transferencia. Se factura.' }],
    captura: { activa: true, titulo: 'Dejar mi pedido',
      campos: [{ id: 'nombre', etiqueta: 'Tu nombre', tipo: 'text', requerido: true },
               { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true },
               { id: 'motivo', etiqueta: '¿Qué necesitas?', tipo: 'textarea', requerido: false }],
      confirmacion: 'Listo, ya tenemos tu pedido. Te confirmamos disponibilidad.' },
  },

  /* ── 4 · Proveedor que cotiza, con atributos propios ───────────────── */
  proveedor: {
    ejemplo: true,
    slug: 'proveedor',
    nombre: 'Proveedor de ejemplo',
    categoria: 'Proveedor y mayoreo',
    descripcion: 'Distribución de insumos a negocios. Venta por volumen con cotización.',
    identidad: { primario: '#3f3f46', acento: '#a1a1aa', fondo: '#ffffff',
                 texto: '#18181b', burbujaIA: '#f4f4f5', avatar: '📦' },
    tono: 'Directo y profesional. Del otro lado hay alguien comprando para su negocio, no un consumidor final.',
    objetivos: ['Entender volumen y plazo', 'Levantar la cotización con datos completos'],
    saludo: 'Hola. ¿Qué insumo necesitas cotizar?',
    sugerencias: ['Pedir cotización', 'Volumen mínimo', 'Tiempos de entrega'],
    politicas: ['precios-sujetos-a-cambio'],
    acciones: ['cotizar', 'mostrar_catalogo', 'derivar_humano'],
    catalogo: [
      { tipo: 'producto', nombre: 'Insumo A', precio: 'según volumen', etiquetas: ['mayoreo'],
        atributos: { 'mínimo': '50 piezas', 'entrega': '5 a 8 días' } },
      { tipo: 'producto', nombre: 'Insumo B', precio: 'según volumen', etiquetas: ['mayoreo'],
        atributos: { 'mínimo': '100 piezas', 'entrega': '3 a 5 días' } },
    ],
    // Los atributos personalizados existen para esto: cosas que solo le
    // importan a este rubro y que nadie debería tener que pedir como columna.
    atributos: {
      'pedido mínimo': '$5,000',
      'crédito': '30 días con historial',
      'cobertura': 'Sureste del país',
    },
    conocimiento: [{ tema: 'facturación', texto: 'Se factura al cierre del pedido. Se requiere constancia fiscal.' }],
    captura: { activa: true, titulo: 'Solicitar cotización',
      campos: [{ id: 'nombre', etiqueta: 'Nombre y empresa', tipo: 'text', requerido: true },
               { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', requerido: true },
               { id: 'motivo', etiqueta: '¿Qué y cuánto necesitas?', tipo: 'textarea', requerido: true }],
      confirmacion: 'Recibido. Te mandamos la cotización por correo o WhatsApp.' },
  },
};

/** Los identificadores de las semillas, para poder distinguirlas de lo real. */
export function slugsDeEjemplo() {
  return Object.keys(SEMILLAS);
}
