// ════════════════════════════════════════════════════════════════════════
//  Banderas rojas — el filtro que corre ANTES que la IA
//
//  Por qué existe: un modelo de lenguaje es probabilístico. Casi siempre
//  manda a urgencias a quien dice "me aprieta el pecho y me duele el brazo",
//  pero "casi siempre" no es un estándar aceptable cuando del otro lado hay
//  un infarto. Aquí el código decide, no el modelo: si el texto tropieza con
//  una bandera, la IA ni siquiera se entera de la pregunta y el paciente
//  recibe una instrucción fija, revisada por un urgenciólogo.
//
//  Regla de diseño: es mejor mandar a urgencias a diez personas que no lo
//  necesitaban, que dejar pasar a una que sí. Este filtro está calibrado
//  para pecar de sensible, no de específico.
// ════════════════════════════════════════════════════════════════════════

// Cada bandera es un motivo clínico con las formas en que la gente REAL lo
// escribe. No son términos médicos: son las palabras del paciente asustado
// a las 2 de la mañana, con faltas de ortografía y sin acentos.
export const BANDERAS = [
  {
    motivo: 'dolor torácico / síndrome coronario',
    patrones: [
      /dolor(cito)?\s+(en|de|del)?\s*(el\s+)?pecho/i,
      /(me\s+)?duele\s+.{0,18}pecho/i,
      /(me\s+)?duele\s+.{0,18}(el\s+)?coraz[oó]n/i,
      /me\s+(aprieta|oprime|arde|quema)\s+el\s+pecho/i,
      /opresi[oó]n\s+(en\s+)?(el\s+)?pecho/i,
      /dolor\s+.{0,20}(brazo\s+izquierdo|mand[ií]bula|espalda)\s+.{0,20}(sudor|n[aá]usea)/i,
      /(creo|siento)\s+que\s+(me\s+)?(est[oó]y\s+)?(dando|da)\s+(un\s+)?infarto/i,
      /infarto/i,
    ],
  },
  {
    motivo: 'dificultad respiratoria',
    patrones: [
      /no\s+puedo\s+respirar/i,
      /me\s+(falta|falto)\s+(el\s+)?aire/i,
      // Conjugado en todas las personas: el que escribe muchas veces NO es
      // el que se está ahogando, es la mamá que ve a su hijo.
      /(me|se|te)\s+(me\s+)?ahog[oa]\b/i,
      /ahog[aá]ndo(se|me)?/i,
      /dificultad\s+para\s+respirar/i,
      /labios?\s+(morados?|azules?)/i,
    ],
  },
  {
    motivo: 'déficit neurológico agudo / EVC',
    patrones: [
      /no\s+(puedo|podia|puedo)\s+hablar/i,
      /(se\s+me\s+)?(tuerce|torci[oó])\s+la\s+(boca|cara)/i,
      /(no\s+siento|se\s+me\s+durmi[oó]|no\s+puedo\s+mover)\s+.{0,15}(medio\s+cuerpo|un\s+lado|brazo|pierna)/i,
      /peor\s+dolor\s+de\s+cabeza\s+de\s+mi\s+vida/i,
      /derrame|embolia|trombosis\s+cerebral/i,
      /convulsi/i,
    ],
  },
  {
    motivo: 'alteración del estado de alerta',
    patrones: [
      /me\s+desmay[eé]|desmayo|p[eé]rdida\s+(del\s+)?conocimiento/i,
      /(no\s+)?(responde|reacciona)\s+.{0,15}(nada|nadie)/i,
      /est[aá]\s+inconsciente/i,
    ],
  },
  {
    motivo: 'sangrado activo',
    patrones: [
      /sangrado\s+(que\s+no\s+para|abundante|much[oa])/i,
      /(vomit|arroj)\w*\s+sangre/i,
      /(popo|heces|excremento)\s+negr/i,
      /no\s+(puedo|logro)\s+(parar|detener)\s+.{0,10}sangr/i,
    ],
  },
  {
    motivo: 'urgencia obstétrica',
    patrones: [
      /embaraz\w+\s+.{0,40}(sangr|dolor\s+fuerte|no\s+se\s+mueve|no\s+siento\s+al\s+beb)/i,
      /(sangr|dolor\s+fuerte)\w*\s+.{0,40}embaraz/i,
    ],
  },
  {
    motivo: 'descompensación metabólica',
    patrones: [
      /(glucosa|az[uú]car)\s+.{0,15}(en|de)?\s*[3-9]\d{2}/i,   // ≥300 mg/dL
      /(glucosa|az[uú]car)\s+.{0,15}(en|de)?\s*[2-3]\d\b/i,     // ≤39 mg/dL
      /cetoacidosis/i,
    ],
  },
  {
    motivo: 'riesgo suicida',
    patrones: [
      /quiero\s+(morir|matarme|desaparecer)/i,
      /quiero\s+quitar(me)?\s+la\s+vida/i,
      /(quitarme|acabar\s+con)\s+la\s+vida/i,
      /suicid/i,
      /ya\s+no\s+quiero\s+vivir/i,
      /pensando\s+en\s+.{0,15}hacerme\s+da[ñn]o/i,
    ],
  },
];

// El texto que ve el paciente. Fijo, sin IA de por medio.
// 911 es el número único de emergencias en México desde 2016.
export const MENSAJE_URGENCIA = {
  general:
    'Por lo que me escribes, esto **no se resuelve por chat**. Llama al **911** ahora ' +
    'o ve al servicio de urgencias más cercano. No manejes tú: pide que te lleven. ' +
    'No esperes a que se te pase para ver si mejora.',
  'riesgo suicida':
    'Lo que me cuentas importa y no lo vas a resolver solo en un chat. ' +
    'En México la **Línea de la Vida** atiende gratis las 24 horas: **800 911 2000**. ' +
    'Si sientes que puedes hacerte daño ahora mismo, llama al **911** o pide a alguien ' +
    'de confianza que se quede contigo mientras consigues ayuda.',
};

/**
 * Lo que el negocio agrega DESPUÉS del mensaje de urgencia.
 *
 * ── EL INVARIANTE, Y NO SE NEGOCIA ──
 * El 911 va PRIMERO y SIEMPRE. Lo del médico va después, y NUNCA en lugar
 * de. Un teléfono particular no sustituye a un servicio de emergencias: no
 * tiene ambulancia, puede estar en quirófano, puede estar dormido. Si
 * alguna vez alguien invierte este orden «porque el doctor prefiere que le
 * marquen a él», habrá convertido una instrucción de urgencia en una lista
 * de espera.
 *
 * Sirve igual a un urgenciólogo, a un intensivista o a un internista: lo
 * que cambia es lo que cada uno cargó, no el código.
 *
 * En riesgo suicida NO se agrega nada: ese mensaje ya trae la Línea de la
 * Vida, y sumarle un consultorio diluye el número que de verdad importa.
 */
export function colaDelNegocio(perfil, motivo) {
  if (motivo === 'riesgo suicida') return '';

  const c = perfil?.contactos || {};
  const u = c.urgencias || {};
  const tel = String(u.telefono || u.whatsapp || '').trim();
  const donde = String(u.etiqueta || '').trim();
  if (!tel && !donde) return '';

  let cola = '\n\n';
  if (tel && donde) cola += `Ya que vayas en camino, avísanos al **${tel}**: ${donde}.`;
  else if (tel)     cola += `Ya que vayas en camino, avísanos al **${tel}** para darte seguimiento.`;
  else              cola += `${donde}`;
  return cola;
}

/**
 * Revisa el texto del paciente contra todas las banderas.
 * Devuelve null si está limpio, o { motivo, mensaje } si hay que cortar.
 */
export function revisarBanderas(texto) {
  if (!texto || typeof texto !== 'string') return null;

  // Se normaliza para que "dolor de pécho" o "NO PUEDO RESPIRAR" caigan igual.
  const t = texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const bandera of BANDERAS) {
    for (const patron of bandera.patrones) {
      // Los patrones se escribieron con acentos opcionales, así que se prueban
      // contra el texto original Y contra el normalizado.
      if (patron.test(texto) || patron.test(t)) {
        return {
          motivo: bandera.motivo,
          mensaje: MENSAJE_URGENCIA[bandera.motivo] || MENSAJE_URGENCIA.general,
        };
      }
    }
  }
  return null;
}
