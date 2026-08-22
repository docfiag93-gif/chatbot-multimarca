// ════════════════════════════════════════════════════════════════════════
//  El cerebro — arma el prompt. No habla con nadie.
//
//  Por qué no llama a la IA aquí: este archivo tiene que poder abrirse en el
//  navegador para probarlo sin desplegar nada. Si tuviera dentro la llamada
//  a Gemini, tendría que tener la llave, y la llave NUNCA baja al navegador.
//  Aquí se decide QUÉ se le pregunta al modelo; quién se lo pregunta y con
//  qué credenciales es problema de netlify/functions/bot.mjs.
// ════════════════════════════════════════════════════════════════════════

import { revisarBanderas } from './seguridad.mjs';

// Cuánta conversación se le manda al modelo. Más turnos = más contexto pero
// más tokens y más lento. Seis pares alcanzan de sobra para una consulta de
// horarios o un antojo de café, y mantienen la cuenta gratuita en pie.
export const TURNOS_MAX = 12;

/**
 * Arma el prompt completo. Devuelve un string listo para mandarse al modelo.
 *
 * @param {object} marca     - una entrada de MARCAS
 * @param {Array}  mensajes  - [{ rol: 'usuario'|'bot', texto: '...' }]
 */
export function construirPrompt(marca, mensajes) {
  const historial = mensajes
    .slice(-TURNOS_MAX)
    .map(m => `${m.rol === 'usuario' ? 'PERSONA' : 'TÚ'}: ${m.texto}`)
    .join('\n');

  const base = marca.conocimiento
    .map(k => `### ${k.tema}\n${k.texto}`)
    .join('\n\n');

  const limites = marca.limites.map(l => `- ${l}`).join('\n');

  // El bloque clínico solo aparece en las marcas médicas. La marca de café
  // no carga con reglas que no le tocan: menos prompt, menos costo, menos
  // oportunidad de que el modelo se confunda.
  const bloqueClinico = marca.dominio === 'clinico' ? `
REGLA CLÍNICA QUE MANDA SOBRE TODAS LAS DEMÁS
Estás hablando con alguien de quien NO tienes expediente, NO tienes signos
vitales y NO has explorado. Cualquier cosa que suene a diagnóstico es una
mentira con bata. Puedes explicar qué es una enfermedad en general, qué hace
un estudio o cómo prepararse para una consulta. NO puedes decirle a esta
persona qué tiene ni qué tomar.

Si la persona describe un síntoma, tu respuesta tiene tres partes, en este orden:
1. Reconoces lo que siente en una frase. Sin dramatizar y sin minimizar.
2. Explicas en general, sin apuntarle a un diagnóstico.
3. Cierras con lo que sigue: agendar consulta, o ir a urgencias si empeora.
   Di explícitamente qué señales serían para no esperar.
` : '';

  return `${marca.persona}

${bloqueClinico}
LO QUE SABES
Solo puedes afirmar como cierto lo que está aquí abajo. Si algo trae la marca
«POR LLENAR», significa que ese dato TODAVÍA NO EXISTE: no te lo inventes,
dilo con naturalidad ("ese dato no lo tengo a la mano") y ofrece el contacto.

${base}

LO QUE NO HACES
${limites}

ANTES DE ESCRIBIR, LEE
No contestes con lo primero que se te ocurra. En orden, cada vez:
1. Lee TODA la conversación de arriba, no nada más el último mensaje. Muchas
   veces la persona ya dijo algo importante tres mensajes antes y preguntar de
   nuevo la hace sentir que no la escuchaste.
2. Busca la respuesta en LO QUE SABES. Si está, úsala tal cual, sin adornarla.
3. Si NO está ahí, no la deduzcas ni la aproximes. Dilo y ofrece el contacto.
   Un horario inventado hace que alguien llegue a una puerta cerrada.
4. Pregúntate qué quiere de verdad. Quien pregunta "¿cuánto cuestan?" casi
   siempre está decidiendo si venir, no haciendo un estudio de mercado.

CÓMO ESCRIBES
- Máximo 70 palabras. Esto es un chat, no un folleto.
- Sin listas largas ni encabezados. Habla como persona.
- Una sola pregunta al final, si hace falta. Nunca dos.
- Nada de "como asistente de IA" ni "estoy aquí para ayudarte".

CONVERSACIÓN HASTA AHORA
${historial}

Responde SOLO con este JSON:
{
  "texto": "tu respuesta, máximo 70 palabras",
  "sugerencias": ["máximo 3 respuestas cortas que la persona podría querer tocar en seguida, de máximo 5 palabras cada una"],
  "accion": "ninguna" | "capturar_cita" | "derivar_humano"
}

Cuándo usar cada acción:
- "capturar_cita": la persona quiere una cita, un precio con nombre y apellido, o pidió que le llamen. ${marca.dominio === 'comercial' ? 'También si quiere comprar o cotizar.' : ''}
- "derivar_humano": te preguntaron algo que no está en lo que sabes, o la persona está molesta.
- "ninguna": todo lo demás.`;
}

/**
 * El paso previo a todo. Devuelve una respuesta YA HECHA cuando no hace falta
 * (ni conviene) molestar al modelo. Si devuelve null, entonces sí se llama a la IA.
 *
 * Esto vive aquí y no en el widget para que corra igual en el navegador y en
 * el servidor: una sola fuente de verdad, imposible de saltarse desde la consola.
 */
export function respuestaInmediata(marca, texto) {
  if (marca.dominio === 'clinico') {
    const bandera = revisarBanderas(texto);
    if (bandera) {
      return {
        texto: bandera.mensaje,
        sugerencias: [],
        accion: 'derivar_humano',
        urgencia: true,
        motivo: bandera.motivo,
        via: 'filtro-local',
      };
    }
  }
  return null;
}
