// ════════════════════════════════════════════════════════════════════════
//  Políticas — módulos que se activan a propósito
//
//  Antes, decir que un negocio era 'clinico' encendía sola una batería de
//  reglas médicas. Eso tenía dos problemas: una tienda no podía existir sin
//  elegir entre dos sectores, y un negocio de salud recibía reglas que quizá
//  no le tocaban, sin que nadie lo decidiera.
//
//  Aquí cada política es un módulo con nombre propio que alguien ENCIENDE.
//  Por omisión no hay ninguna: un negocio nuevo empieza sin reglas especiales.
//
//  Una política puede hacer dos cosas:
//
//    · interceptar(texto) — cortar ANTES de llamar a la IA y devolver una
//      respuesta fija. Es para lo que no se le puede confiar a un modelo
//      probabilístico.
//    · aportar prompt y límites — moldear cómo responde la IA en el resto.
//
//  Para agregar una política nueva no se toca ningún otro archivo: se añade
//  una entrada aquí y aparece sola en el panel.
// ════════════════════════════════════════════════════════════════════════

import { revisarBanderas } from './seguridad.mjs';

export const POLITICAS = {

  /* ── Urgencias que no pueden esperar a un modelo ─────────────────────
     Vive aquí, no en el núcleo, y no se enciende sola. Un negocio de salud
     que solo agenda citas puede no quererla; uno que atiende consultas sí. */
  'urgencias-clinicas': {
    nombre: 'Detección de urgencias médicas',
    resumen: 'Corta la conversación y manda a servicios de emergencia cuando alguien describe una situación que no puede esperar.',
    aviso: 'Actívala solo si tu negocio atiende temas de salud. Es una decisión con consecuencias: revisa el texto que recibe la persona.',
    intercepta: true,

    interceptar(texto) {
      const bandera = revisarBanderas(texto);
      if (!bandera) return null;
      return {
        texto: bandera.mensaje,
        sugerencias: [],
        accion: 'derivar_humano',
        urgencia: true,
        motivo: bandera.motivo,
        via: 'politica:urgencias-clinicas',
      };
    },

    prompt: `REGLA QUE MANDA SOBRE TODAS LAS DEMÁS
Estás hablando con alguien de quien NO tienes expediente, NO tienes signos
vitales y NO has explorado. Cualquier cosa que suene a diagnóstico es una
afirmación sin sustento. Puedes explicar en general, decir para qué sirve un
estudio o cómo prepararse para una cita. NO puedes decirle a esta persona qué
tiene ni qué tomar.

Si describe un síntoma: reconoce lo que siente en una frase, explica en
general sin apuntar a un diagnóstico, y cierra diciendo qué sigue — incluyendo
qué señales serían para no esperar.`,

    limites: [
      'NO diagnosticas. Ni siquiera "podría ser". Ni aunque insistan.',
      'NO recetas, no ajustas dosis, no sugieres suspender un medicamento.',
      'NO interpretas resultados de laboratorio ni estudios de imagen.',
      'NO das pronóstico ni opinas sobre lo que otro profesional indicó.',
    ],
  },

  /* ── Dinero ajeno ────────────────────────────────────────────────────── */
  'sin-consejo-financiero': {
    nombre: 'Sin recomendaciones de inversión',
    resumen: 'Impide que el bot recomiende dónde invertir, prometa rendimientos o dé consejo financiero personalizado.',
    aviso: 'Útil en despachos contables, inmobiliarias, seguros y cualquier negocio donde una frase mal dicha se lea como una promesa de rendimiento.',
    intercepta: false,
    prompt: `Puedes explicar cómo funciona un producto, un trámite o un costo.
NO recomiendas dónde invertir, no prometes rendimientos y no das consejo
financiero adaptado a la situación de nadie. Si te lo piden, lo dices con
claridad y ofreces una cita con una persona.`,
    limites: [
      'NO prometes rendimientos, plazos de retorno ni ganancias.',
      'NO recomiendas comprar, vender ni invertir en nada concreto.',
      'NO opinas sobre la situación financiera de quien te escribe.',
    ],
  },

  /* ── Menores ─────────────────────────────────────────────────────────── */
  'trato-con-menores': {
    nombre: 'Puede haber menores de edad',
    resumen: 'Ajusta el lenguaje y evita pedir datos personales cuando el negocio atiende a niños o adolescentes.',
    aviso: 'Para academias, guarderías, pediatría, campamentos o clubes deportivos.',
    intercepta: false,
    prompt: `Es posible que quien te escribe sea menor de edad. Usa lenguaje
sencillo y directo. Antes de pedir cualquier dato personal, pide hablar con
su madre, padre o tutor. No agendes ni comprometas nada con un menor.`,
    limites: [
      'NO pides datos personales a alguien que parezca menor de edad.',
      'NO agendas ni confirmas nada sin un adulto responsable.',
    ],
  },

  /* ── Precios que cambian ─────────────────────────────────────────────── */
  'precios-sujetos-a-cambio': {
    nombre: 'Los precios se confirman con una persona',
    resumen: 'El bot da precios como referencia y siempre aclara que se confirman antes de cerrar.',
    aviso: 'Recomendada si manejas precios por volumen, temporada o tipo de cambio.',
    intercepta: false,
    prompt: `Los precios que tienes son de referencia. Siempre que des uno,
aclara en la misma frase que se confirma antes de cerrar. Nunca presentes un
precio como final ni como una cotización cerrada.`,
    limites: [
      'NO presentas un precio como definitivo ni como cotización en firme.',
    ],
  },
};

/** Para pintar la lista de políticas en el panel, sin exponer el prompt. */
export function catalogoDePoliticas() {
  return Object.entries(POLITICAS).map(([id, p]) => ({
    id, nombre: p.nombre, resumen: p.resumen, aviso: p.aviso, intercepta: !!p.intercepta,
  }));
}

/**
 * Corre las políticas que INTERCEPTAN, antes de gastar una llamada de IA.
 * Devuelve una respuesta ya hecha, o null si ninguna aplica.
 *
 * Si el negocio no encendió ninguna política, esto devuelve null de
 * inmediato: el caso normal no paga nada por una función que no usa.
 */
export function interceptar(perfil, texto) {
  const activas = Array.isArray(perfil?.politicas) ? perfil.politicas : [];
  if (!activas.length || !texto) return null;

  for (const id of activas) {
    const p = POLITICAS[id];
    if (!p?.intercepta || typeof p.interceptar !== 'function') continue;
    const r = p.interceptar(texto);
    if (r) return { ...r, politica: id };
  }
  return null;
}

/** Lo que las políticas activas aportan al prompt y a los límites. */
export function aportesDePoliticas(perfil) {
  const activas = Array.isArray(perfil?.politicas) ? perfil.politicas : [];
  const prompt = [];
  const limites = [];
  for (const id of activas) {
    const p = POLITICAS[id];
    if (!p) continue;                       // una política borrada no rompe nada
    if (p.prompt) prompt.push(p.prompt);
    if (p.limites) limites.push(...p.limites);
  }
  return { prompt, limites };
}
