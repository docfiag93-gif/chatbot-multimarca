// ════════════════════════════════════════════════════════════════════════
//  El cerebro — arma el prompt. No habla con nadie.
//
//  Por qué no llama a la IA aquí: este archivo tiene que poder abrirse en el
//  navegador para probarlo sin desplegar nada. Si tuviera dentro la llamada
//  al proveedor, tendría que tener la llave, y la llave NUNCA baja al
//  navegador. Aquí se decide QUÉ se le pregunta; quién se lo pregunta y con
//  qué credenciales es problema de servidor/bot.mjs.
//
//  SIN SECTOR. Este archivo no sabe qué es un consultorio, una tienda ni un
//  taller. Antes tenía un bloque clínico que se encendía con
//  `dominio === 'clinico'`: eso obligaba a que todo negocio del mundo
//  eligiera entre dos rubros. Ahora el prompt se arma con lo que el negocio
//  describió de sí mismo, más lo que aporten las políticas que ENCENDIÓ.
// ════════════════════════════════════════════════════════════════════════

import { normalizarPerfil } from '../../publico/cerebro/perfil.mjs';
import { interceptar, aportesDePoliticas } from './politicas.mjs';
import { fragmentoDeAcciones, accionPermitida } from './acciones.mjs';

// Cuánta conversación se le manda al modelo. Más turnos = más contexto pero
// más tokens y más lento. Seis pares alcanzan de sobra para una consulta
// normal y mantienen la cuenta gratuita en pie.
export const TURNOS_MAX = 12;

const DIAS_ES = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

/* ── trozos del prompt, cada uno opcional ────────────────────────────── */

function bloqueIdentidad(p) {
  const partes = [`Eres el asistente de ${p.nombre}.`];
  if (p.categoria) partes.push(`Es un negocio de: ${p.categoria}.`);
  if (p.descripcion) partes.push(p.descripcion);
  partes.push(p.tono);
  if (p.objetivos.length) {
    partes.push(`Lo que el negocio quiere lograr en cada conversación:\n` +
      p.objetivos.map(o => `- ${o}`).join('\n'));
  }
  return partes.join('\n');
}

function bloqueCatalogo(p) {
  if (!p.catalogo.length) return '';
  // Se recorta: un catálogo de doscientas cosas no cabe en un prompt y el
  // modelo se pierde. Lo disponible primero.
  const items = p.catalogo.filter(o => o.disponible).slice(0, 60);
  if (!items.length) return '';
  const lineas = items.map(o => {
    const trozos = [`- ${o.nombre}`];
    if (o.precio) trozos.push(`(${o.precio})`);
    if (o.descripcion) trozos.push(`— ${o.descripcion}`);
    if (o.etiquetas.length) trozos.push(`[${o.etiquetas.join(', ')}]`);
    return trozos.join(' ');
  });
  return `LO QUE OFRECE\n${lineas.join('\n')}`;
}

function bloqueHorarios(p) {
  const abiertos = Object.entries(p.horarios).filter(([, v]) => !v.cerrado);
  if (!abiertos.length) return '';
  const lineas = abiertos.map(([d, v]) => `- ${DIAS_ES[d] || d}: ${v.abre} a ${v.cierra}`);
  const cerrados = Object.entries(p.horarios).filter(([, v]) => v.cerrado)
    .map(([d]) => DIAS_ES[d] || d);
  return `HORARIOS\n${lineas.join('\n')}` +
    (cerrados.length ? `\nCerrado: ${cerrados.join(', ')}.` : '');
}

function bloqueUbicaciones(p) {
  if (!p.ubicaciones.length) return '';
  const lineas = p.ubicaciones.map(u => {
    const t = [`- ${u.nombre || 'Sucursal'}: ${u.direccion}`];
    if (u.referencias) t.push(`Referencias: ${u.referencias}`);
    return t.join(' ');
  });
  return `DÓNDE ESTÁ\n${lineas.join('\n')}`;
}

function bloqueConocimiento(p) {
  if (!p.conocimiento.length) return '';
  return `LO QUE SABES\n` +
    p.conocimiento.map(k => `### ${k.tema}\n${k.texto}`).join('\n\n');
}

function bloqueAtributos(p) {
  const claves = Object.keys(p.atributos || {});
  if (!claves.length) return '';
  return `OTROS DATOS DEL NEGOCIO\n` +
    claves.slice(0, 30).map(k => `- ${k}: ${p.atributos[k]}`).join('\n');
}

/* ── el prompt completo ──────────────────────────────────────────────── */

/**
 * @param {object} perfil    - perfil de negocio (cualquier rubro)
 * @param {Array}  mensajes  - [{ rol: 'usuario'|'bot', texto: '...' }]
 */
export function construirPrompt(perfil, mensajes) {
  const p = normalizarPerfil(perfil);
  const politicas = aportesDePoliticas(p);

  const historial = (Array.isArray(mensajes) ? mensajes : [])
    .slice(-TURNOS_MAX)
    .map(m => `${m.rol === 'usuario' ? 'PERSONA' : 'TÚ'}: ${m.texto}`)
    .join('\n');

  // Los límites propios del negocio y los que aportan sus políticas se juntan
  // en una sola lista: al modelo no le sirve saber de dónde salió cada uno.
  const limites = [...politicas.limites, ...p.limites];

  const secciones = [
    bloqueIdentidad(p),
    // Las políticas van ARRIBA de todo lo demás: si una dice "no
    // diagnostiques", esa instrucción no puede quedar sepultada bajo un
    // catálogo de sesenta renglones.
    politicas.prompt.join('\n\n'),
    bloqueConocimiento(p),
    bloqueCatalogo(p),
    bloqueHorarios(p),
    bloqueUbicaciones(p),
    bloqueAtributos(p),

    limites.length ? `LO QUE NO HACES\n${limites.map(l => `- ${l}`).join('\n')}` : '',

    `ANTES DE ESCRIBIR, LEE
No contestes con lo primero que se te ocurra. En orden, cada vez:
1. Lee TODA la conversación, no solo el último mensaje. Muchas veces la
   persona ya dijo algo importante tres mensajes antes, y preguntar de nuevo
   la hace sentir que no la escuchaste.
2. Busca la respuesta en lo que sabes del negocio. Si está, úsala tal cual.
3. Si NO está, no la deduzcas ni la aproximes. Dilo y ofrece el contacto.
   Un dato inventado manda a alguien a una puerta cerrada.
4. Pregúntate qué quiere de verdad. Quien pregunta "¿cuánto cuesta?" casi
   siempre está decidiendo si viene, no haciendo un estudio de mercado.`,

    `CÓMO ESCRIBES
- Máximo 70 palabras. Esto es un chat, no un folleto.
- Sin listas largas ni encabezados. Habla como persona.
- Una sola pregunta al final, si hace falta. Nunca dos.
- Nada de "como asistente de IA" ni "estoy aquí para ayudarte".
- Responde en ${p.idioma.startsWith('en') ? 'inglés' : p.idioma.startsWith('pt') ? 'portugués' : 'español'}.`,

    fragmentoDeAcciones(p),

    `CONVERSACIÓN HASTA AHORA\n${historial}`,

    `Responde SOLO con este JSON:
{
  "texto": "tu respuesta, máximo 70 palabras",
  "sugerencias": ["hasta 3 respuestas cortas que la persona podría querer tocar en seguida, máximo 5 palabras cada una"],
  "accion": "una de las acciones disponibles, o \\"ninguna\\""
}`,
  ];

  return secciones.filter(Boolean).join('\n\n');
}

/**
 * El paso previo a todo: si alguna política del negocio intercepta, devuelve
 * una respuesta YA HECHA sin gastar una llamada de IA. Si devuelve null,
 * entonces sí se le pregunta al modelo.
 *
 * Vive aquí y no en el widget para que corra igual en el navegador y en el
 * servidor: una sola fuente de verdad, imposible de saltarse desde la consola.
 *
 * Un negocio sin políticas encendidas nunca entra a este camino.
 */
export function respuestaInmediata(perfil, texto) {
  return interceptar(perfil, texto);
}

/** Filtra lo que devolvió el modelo contra lo que el negocio permite. */
export function accionValida(perfil, accion) {
  return accionPermitida(normalizarPerfil(perfil), accion) ? accion : 'ninguna';
}
