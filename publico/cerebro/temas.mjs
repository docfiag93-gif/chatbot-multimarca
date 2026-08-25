/* ══════════════════════════════════════════════════════════════════════
   PROPONER UN TEMA a partir de una pregunta que el bot no supo contestar.

   Vive en su propio módulo y no dentro del HTML de la consola por una
   razón práctica: lo que está enterrado en una etiqueta <script> no se
   puede probar. Y esto se equivoca de formas silenciosas —una palabra
   vacía que se cuela, un acento que parte una palabra— que solo se ven con
   casos escritos.

   QUÉ NO HACE: proponer la RESPUESTA. Eso sería inventar, que es justo lo
   que este producto se niega a hacer. Solo propone la etiqueta, que es la
   parte aburrida de escribir.
   ══════════════════════════════════════════════════════════════════════ */

// Palabras que aparecen en cualquier pregunta y no dicen de qué trata.
const VACIAS = new Set([
  'que','qué','cual','cuál','cuales','cuáles','como','cómo','donde','dónde',
  'cuando','cuándo','cuanto','cuánto','cuanta','cuánta','quien','quién',
  'por','para','con','sin','los','las','del','una','uno','unos','unas',
  'hay','tienen','tiene','tengo','puedo','puede','pueden','quiero','quisiera',
  'necesito','me','te','se','nos','de','la','el','en','y','o','a','es','son',
  'su','sus','mi','mis','al','lo','le','les','si','ya','yo','un','esta','este',
  'eso','esa','ese','hola','buenas','buenos','dias','días','tardes','favor',
  'gracias','ustedes','usted',
]);

/**
 * Devuelve una etiqueta corta, o cadena vacía si la pregunta no da para una.
 * Prefiere las primeras palabras con contenido: en español el sustantivo de
 * la pregunta suele venir antes que sus complementos.
 */
export function temaSugerido(pregunta, { maximo = 3 } = {}) {
  const palabras = String(pregunta || '')
    .toLowerCase()
    // Los signos se quitan; los acentos NO. «diseño» y «diseno» no son la
    // misma palabra, y partirla por el acento produce temas rotos.
    .replace(/[¿?¡!.,;:()"'«»\-_/\\]+/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2 && !VACIAS.has(p) && !/^\d+$/.test(p));

  return palabras.slice(0, maximo).join(' ');
}

/* ══════════════════════════════════════════════════════════════════════
   QUÉ TE PREGUNTAN MÁS

   El dueño llenó su base de conocimiento adivinando qué le iban a
   preguntar. Aquí se ve lo que de verdad le preguntan, contado.

   ── LO QUE ESTO NO HACE ──
   No propone respuestas, y no es negociable. Un bot que aprende de sus
   propias contestaciones acaba repitiendo sus errores con más seguridad
   cada vez — y en un consultorio eso no es un bug, es un daño. Aquí solo
   se agrupa y se cuenta. La respuesta la escribe una persona.
   ══════════════════════════════════════════════════════════════════════ */

/* Para AGRUPAR sí se quitan los acentos, al revés que en `temaSugerido`.
   Ahí el acento es parte de la etiqueta que se le muestra al dueño; aquí
   solo sirve para que «cuánto» y «cuanto» —la misma pregunta escrita por
   dos personas, una con prisa— caigan en el mismo montón. */
const sinAcentos = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* Plural fuera, en sustantivos y en verbos: «precio/precios» y
   «cuesta/cuestan» son la misma pregunta escrita por dos personas.

   Es un recorte tosco, no un lematizador, y puede equivocarse: «examen» se
   queda en «exame», «joven» en «jove». NO IMPORTA, y la razón vale la pena
   dejarla escrita porque a primera vista esto parece un bug:

   estos recortes NUNCA se le muestran a nadie. Solo se usan para comparar
   dos preguntas entre sí, y a los dos lados se les aplica el mismo recorte.
   Lo que hace falta aquí es que sea CONSISTENTE, no que sea correcto. Un
   lematizador de verdad pesa más que todo este archivo y no compraría nada.

   Lo que se le enseña al dueño es siempre la pregunta tal como la escribió
   su paciente. */
const singular = p => {
  if (p.length <= 4) return p;
  let q = p;
  // Las dos reglas se aplican EN CADENA, no una u otra. Escrito como
  // «si no aplica la primera, prueba la segunda», «examenes» acababa en
  // «examen» y «examen» en «exame»: la misma palabra con dos recortes
  // distintos, que es exactamente el fallo que esto vino a evitar.
  if (/(es|s)$/.test(q)) q = q.replace(/(es|s)$/, '');      // precios  → precio
  if (q.length > 4 && /(an|en)$/.test(q)) q = q.slice(0, -1); // cuestan → cuesta
  return q;
};

/** Las palabras con contenido de una frase, listas para comparar. */
export function palabrasClave(texto) {
  return [...new Set(
    sinAcentos(texto).toLowerCase()
      .replace(/[¿?¡!.,;:()"'«»\-_/\\]+/g, ' ')
      .split(/\s+/)
      .filter(p => p.length > 2 && !VACIAS.has(p) && !/^\d+$/.test(p))
      .map(singular)
  )];
}

/** Qué tanto se parecen dos preguntas: 0 = nada, 1 = las mismas palabras. */
export function parecido(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  return comunes / (A.size + B.size - comunes);     // Jaccard
}

/**
 * Junta las preguntas parecidas y las cuenta.
 *
 * Cada entrada puede traer `sinDato: true` si en ese turno el bot tuvo que
 * admitir que no sabía. Esa es la columna que convierte una lista curiosa en
 * una lista de tareas: no importa que pregunten mucho por el estacionamiento
 * si el bot ya sabe contestarlo.
 */
export function agruparPreguntas(entradas, { umbral = 0.5, minimo = 2 } = {}) {
  const monton = [];

  for (const e of (Array.isArray(entradas) ? entradas : [])) {
    const texto = String(e?.texto ?? e ?? '').trim();
    if (!texto) continue;
    const claves = palabrasClave(texto);
    // Un «hola» suelto no es una pregunta: no tiene ni una palabra con
    // contenido. Contarlo llenaría la lista de saludos.
    if (!claves.length) continue;

    const cerca = monton.find(g => parecido(g.claves, claves) >= umbral);
    if (cerca) {
      cerca.veces++;
      if (e?.sinDato) cerca.sinRespuesta++;
      // Se guarda la redacción MÁS CORTA como ejemplo: es la que se lee de
      // un vistazo en una lista de veinte.
      if (texto.length < cerca.ejemplo.length) cerca.ejemplo = texto;
      // Las claves del montón crecen con lo que traen las nuevas, para que
      // una pregunta larga siga atrayendo a sus variantes cortas.
      for (const c of claves) if (!cerca.claves.includes(c)) cerca.claves.push(c);
    } else {
      monton.push({
        ejemplo: texto,
        claves,
        veces: 1,
        sinRespuesta: e?.sinDato ? 1 : 0,
      });
    }
  }

  return monton
    .filter(g => g.veces >= minimo)
    .map(g => ({
      pregunta: g.ejemplo,
      tema: temaSugerido(g.ejemplo),
      veces: g.veces,
      sinRespuesta: g.sinRespuesta,
      // Lo que de verdad ordena la lista: preguntan mucho Y no sabemos.
      urgencia: g.sinRespuesta * 2 + g.veces,
    }))
    // Primero lo que más duele: mucha gente preguntando algo que no sabemos.
    .sort((a, b) => b.urgencia - a.urgencia || b.veces - a.veces);
}
