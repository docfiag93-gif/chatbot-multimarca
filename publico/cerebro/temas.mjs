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
