// ════════════════════════════════════════════════════════════════════════
//  Sugerencias para la interfaz — NO son reglas
//
//  Esta lista existe para ahorrarle tecleo a quien da de alta un negocio. No
//  valida nada, no restringe nada y el modelo de datos ni la consulta.
//
//  Vive fuera de perfil.mjs a propósito: el modelo no debe conocer ningún
//  rubro. Si mañana esta lista se borra, el sistema sigue aceptando cualquier
//  categoría — porque `categoria` siempre fue texto libre.
//
//  "Otro" va al final y no es un caso especial: es el recordatorio de que la
//  lista está incompleta por diseño.
// ════════════════════════════════════════════════════════════════════════

export const CATEGORIAS_SUGERIDAS = [
  'Comercio y tienda',
  'Restaurante y alimentos',
  'Servicios profesionales',
  'Salud y bienestar',
  'Educación y formación',
  'Bienes raíces',
  'Taller y reparación',
  'Proveedor y mayoreo',
  'Turismo y hospedaje',
  'Belleza y cuidado personal',
  'Deporte y acondicionamiento',
  'Otro',
];

/* ── Catálogos para el panel ──────────────────────────────────────────
 *  Solo METADATOS: id, nombre y resumen. Nada de prompts ni de límites.
 *
 *  Antes el panel importaba politicas.mjs y acciones.mjs completos, así que
 *  el texto exacto de las reglas —el trabajo real del producto— quedaba
 *  descargable desde el sitio público. Quien lo leyera podía estudiar cómo
 *  saltarse los límites clínicos.
 *
 *  Estas listas se mantienen a mano y a propósito: son cortas, cambian poco,
 *  y duplicar tres campos vale mucho menos que publicar el prompt entero.
 *  Hay una prueba que falla si el panel deja de coincidir con el servidor.
 * ─────────────────────────────────────────────────────────────────── */

export const POLITICAS_UI = [
  { id:'urgencias-clinicas', nombre:'Detección de urgencias médicas', intercepta:true,
    resumen:'Corta la conversación y manda a servicios de emergencia cuando alguien describe una situación que no puede esperar.',
    aviso:'Actívala solo si tu negocio atiende temas de salud. Es una decisión con consecuencias: revisa el texto que recibe la persona.' },
  { id:'sin-consejo-financiero', nombre:'Sin recomendaciones de inversión', intercepta:false,
    resumen:'Impide que el bot recomiende dónde invertir, prometa rendimientos o dé consejo financiero personalizado.',
    aviso:'Útil en despachos contables, inmobiliarias, seguros y cualquier negocio donde una frase mal dicha se lea como una promesa.' },
  { id:'trato-con-menores', nombre:'Puede haber menores de edad', intercepta:false,
    resumen:'Ajusta el lenguaje y evita pedir datos personales cuando el negocio atiende a niños o adolescentes.',
    aviso:'Para academias, guarderías, pediatría, campamentos o clubes deportivos.' },
  { id:'precios-sujetos-a-cambio', nombre:'Los precios se confirman con una persona', intercepta:false,
    resumen:'El bot da precios como referencia y siempre aclara que se confirman antes de cerrar.',
    aviso:'Recomendada si manejas precios por volumen, temporada o tipo de cambio.' },
];

export const ACCIONES_UI = [
  { id:'mostrar_catalogo',  nombre:'Mostrar lo que ofrece', requiere:'catalogo',
    resumen:'Responde con productos, servicios o espacios del catálogo.' },
  { id:'capturar_contacto', nombre:'Pedir datos para contactar', requiere:null,
    resumen:'Abre un formulario con nombre, teléfono y motivo.' },
  { id:'cotizar',           nombre:'Levantar una cotización', requiere:null,
    resumen:'Recoge qué necesita, cuánto y para cuándo, y lo manda a una persona.' },
  { id:'reservar',          nombre:'Apartar lugar', requiere:null,
    resumen:'Toma los datos para apartar una mesa, un espacio o un equipo.' },
  { id:'agendar',           nombre:'Solicitar una cita', requiere:null,
    resumen:'Recoge los datos para una cita y avisa que se confirma después.' },
  { id:'dar_ubicacion',     nombre:'Decir dónde están', requiere:'ubicaciones',
    resumen:'Responde con la dirección, referencias y enlace de mapa.' },
  { id:'dar_horarios',      nombre:'Decir a qué hora abren', requiere:'horarios',
    resumen:'Responde con los horarios cargados.' },
  { id:'derivar_humano',    nombre:'Pasar a una persona', requiere:null,
    resumen:'Ofrece el contacto directo del negocio.' },
];
