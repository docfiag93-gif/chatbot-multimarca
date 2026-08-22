// ════════════════════════════════════════════════════════════════════════
//  Chatbot — el mensajero  ·  /api/bot
//
//  Corre igual en Netlify y en Cloudflare Pages: los envoltorios de cada
//  plataforma viven en netlify/functions/ y en functions/api/.
//
//  Es una función APARTE de ia.mjs a propósito. ia.mjs es el cerebro clínico
//  de ISA Health Core: si el chatbot público se cuelga o se le acaba la cuota,
//  el paciente que está registrando su glucosa no se debe enterar. Comparten
//  las mismas llaves de entorno, no el mismo código.
//
//  Lo único que hace este archivo: recibir, verificar, preguntar, devolver.
//  Qué se pregunta lo decide chatbot/cerebro/. Quién es la marca lo decide
//  chatbot/cerebro/marcas.mjs.
// ════════════════════════════════════════════════════════════════════════

import { env } from '../publico/cerebro/entorno.mjs';
import { MARCAS } from '../publico/cerebro/marcas.mjs';
import { construirPrompt, respuestaInmediata } from '../publico/cerebro/cerebro.mjs';
import { resolverMarca, configPublica, guardarConversacion, guardarLead, avisar }
  from '../publico/cerebro/datos.mjs';

const GEMINI    = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ      = 'https://api.groq.com/openai/v1';
const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI    = 'https://api.openai.com/v1';
const TTL       = 6 * 60 * 60 * 1000;

// El modelo de Claude. Opus 5 es el más capaz que hay: 1M de contexto,
// razonamiento adaptativo. Se deja en variable de entorno para poder bajarlo
// a uno más barato sin volver a desplegar código.
const MODELO_CLAUDE = env('CLAUDE_MODELO') || 'claude-opus-5';

// Cuánto se le deja "pensar" antes de escribir.
//
// Estaba en 'low', que contesta en el acto. Se subió a propósito: un bot que
// dispara la primera respuesta que se le ocurre es justo el que se inventa un
// horario, o el que le explica un síntoma a alguien que debería estar yendo a
// urgencias. Con 'high' lee toda la conversación, revisa lo que sabe y ENTONCES
// contesta.
//
// El costo es real y hay que saberlo: tarda unos segundos más y gasta más
// tokens. Vale la pena aquí. Si algún día el volumen lo hace pesar, se baja a
// 'medium' desde Netlify sin tocar código.
const ESFUERZO = env('CLAUDE_ESFUERZO') || 'high';

// ── Freno de mano ───────────────────────────────────────────────────────
// Este endpoint es público y anónimo: cualquiera con la URL puede quemarte
// la cuota gratuita en una tarde. 30 mensajes cada 10 minutos por IP alcanza
// de sobra para una conversación real y no para un script.
const _limites = new Map();
function permitir(req) {
  const ip = (req.headers.get('x-nf-client-connection-ip') ||
              req.headers.get('x-forwarded-for') || 'anon').split(',')[0].trim();
  const ahora = Date.now(), ventana = 10 * 60 * 1000, max = 30;
  const prev = _limites.get(ip);
  const item = (!prev || ahora - prev.inicio > ventana) ? { inicio: ahora, n: 0 } : prev;
  item.n++; _limites.set(ip, item);
  if (_limites.size > 2000) for (const [k, v] of _limites) if (ahora - v.inicio > ventana) _limites.delete(k);
  return item.n <= max;
}

// ── Gemini ──────────────────────────────────────────────────────────────
let _gem = null, _gemTs = 0;
async function modeloGemini(key) {
  if (_gem && Date.now() - _gemTs < TTL) return _gem;
  const r = await fetch(`${GEMINI}/models?key=${key}`);
  if (!r.ok) throw new Error('lista de modelos ' + r.status);
  const { models = [] } = await r.json();
  const utiles = models.filter(m =>
    (m.supportedGenerationMethods || []).includes('generateContent') &&
    !/embedding|aqa|imagen|veo|tts/i.test(m.name || ''));
  // Los "preview" y "exp" NO entran en la capa gratuita: ya nos tiraron un
  // 429 en producción con ia.mjs. Solo estables.
  const estable = m => !/preview|thinking|\bexp\b|experimental/i.test(m.name || '');
  const flash = utiles.filter(m => /flash/i.test(m.name) && estable(m));
  const pool = flash.length ? flash : (utiles.filter(estable).length ? utiles.filter(estable) : utiles);
  if (!pool.length) throw new Error('sin modelos de texto');
  pool.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'en', { numeric: true }));
  _gem = pool[0].name; _gemTs = Date.now();
  return _gem;
}

async function gemini(key, prompt) {
  const modelo = await modeloGemini(key);
  const r = await fetch(`${GEMINI}/${modelo}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // 0.6: más suelto que las tareas clínicas de ia.mjs (que van en 0.2)
      // porque aquí sí queremos que suene a persona, no a formulario.
      generationConfig: { temperature: 0.6, maxOutputTokens: 500, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if ([429, 404, 400].includes(r.status)) { _gem = null; _gemTs = 0; }
    throw new Error('gemini ' + r.status + ' ' + t.slice(0, 120).replace(/key=[^&\s"]+/g, 'key=***'));
  }
  const j = await r.json();
  const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!txt) throw new Error('gemini vacío');
  return JSON.parse(txt);
}

// ── Groq: el respaldo ───────────────────────────────────────────────────
let _grq = null, _grqTs = 0;
async function modeloGroq(key) {
  if (_grq && Date.now() - _grqTs < TTL) return _grq;
  const r = await fetch(`${GROQ}/models`, { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('groq modelos ' + r.status);
  const { data = [] } = await r.json();
  const utiles = data.filter(m => !/whisper|tts|guard|vision/i.test(m.id || ''));
  if (!utiles.length) throw new Error('groq sin modelos');
  const rapido = utiles.filter(m => /instant|8b/i.test(m.id));
  _grq = (rapido.length ? rapido : utiles)[0].id; _grqTs = Date.now();
  return _grq;
}

async function groq(key, prompt) {
  const modelo = await modeloGroq(key);
  const r = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6, max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if ([429, 404].includes(r.status)) { _grq = null; _grqTs = 0; }
    throw new Error('groq ' + r.status + ' ' + t.slice(0, 120));
  }
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || '';
  if (!txt) throw new Error('groq vacío');
  return JSON.parse(txt);
}

// ── CLAUDE (Anthropic): el más listo de los cuatro ──────────────────────
//  Va primero en el orden por omisión. Es el que mejor sigue instrucciones
//  largas y con matices, que es justo lo que pide un bot con límites
//  clínicos: "explica pero no diagnostiques" es una frontera fina y los
//  modelos chicos se la brincan.
//
//  Ojo con dos cosas que cambiaron en la API y que es fácil escribir mal:
//   · `budget_tokens` ya no existe en Opus 5: manda 400. El pensamiento es
//     adaptativo y la profundidad se controla con output_config.effort.
//   · La respuesta puede volver con stop_reason 'refusal' y HTTP 200. Si no
//     lo revisas, lees content vacío y crees que el modelo falló.
async function claude(key, prompt) {
  const r = await fetch(`${ANTHROPIC}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO_CLAUDE,
      max_tokens: 2048,
      // Pensamiento adaptativo: el modelo decide cuánto razonar según lo que
      // le llegue. Una pregunta por el horario la contesta directo; un síntoma
      // descrito a medias le toma más. OJO: 'budget_tokens' ya NO existe en
      // Opus 5 — mandarlo devuelve 400. La profundidad va en effort.
      thinking: { type: 'adaptive' },
      output_config: { effort: ESFUERZO },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('claude ' + r.status + ' ' + t.slice(0, 140));
  }

  const j = await r.json();

  // Un rechazo del clasificador de seguridad NO es un error de red: llega
  // como 200. Se trata como fallo para que la cadena pase al siguiente
  // proveedor, en vez de devolverle al paciente una burbuja vacía.
  if (j.stop_reason === 'refusal') {
    throw new Error('claude rechazó la petición (' + (j.stop_details?.category || 'sin categoría') + ')');
  }

  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!txt) throw new Error('claude devolvió vacío');
  return extraerJSON(txt);
}

// ── OPENAI ──────────────────────────────────────────────────────────────
//  Mismo truco que con Gemini y Groq: los nombres de modelo cambian seguido,
//  así que se descubren en vez de dejarlos escritos a mano y que un día
//  truene sin aviso.
let _oai = null, _oaiTs = 0;
async function modeloOpenAI(key) {
  if (env('OPENAI_MODELO')) return env('OPENAI_MODELO');
  if (_oai && Date.now() - _oaiTs < TTL) return _oai;
  const r = await fetch(`${OPENAI}/models`, { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('openai modelos ' + r.status);
  const { data = [] } = await r.json();
  const utiles = data.filter(m => /^gpt/i.test(m.id || '') &&
    !/audio|realtime|transcribe|tts|image|search|embedding/i.test(m.id));
  if (!utiles.length) throw new Error('openai sin modelos de chat');
  utiles.sort((a, b) => (b.id || '').localeCompare(a.id || '', 'en', { numeric: true }));
  _oai = utiles[0].id; _oaiTs = Date.now();
  return _oai;
}

async function openai(key, prompt) {
  const modelo = await modeloOpenAI(key);
  const r = await fetch(`${OPENAI}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if ([429, 404].includes(r.status)) { _oai = null; _oaiTs = 0; }
    throw new Error('openai ' + r.status + ' ' + t.slice(0, 140));
  }
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || '';
  if (!txt) throw new Error('openai devolvió vacío');
  return extraerJSON(txt);
}

// Claude no tiene un "modo JSON" que se active con una bandera como Gemini o
// Groq: se le pide en el prompt. A veces envuelve el JSON en ```json. Esto lo
// desenvuelve en vez de tirar toda la respuesta por una comilla de más.
function extraerJSON(txt) {
  const limpio = String(txt).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try { return JSON.parse(limpio); }
  catch (e) {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('no devolvió JSON válido');
  }
}

// ── La cadena ───────────────────────────────────────────────────────────
//  Se intenta uno por uno hasta que alguno conteste. Cuatro proveedores no es
//  exageración: ya nos pasó en producción que Gemini devolviera 429 por cuota
//  a media consulta. Con cuatro, quedarse sin cuota deja de ser un problema
//  del paciente y pasa a ser una nota en el log.
//
//  El orden se cambia desde Netlify con BOT_ORDEN, sin tocar código. Por
//  omisión manda Claude porque es el que mejor respeta los límites clínicos,
//  y Groq va al final porque es el más rápido y gratis: el último recurso
//  ideal cuando los de paga ya dijeron que no.
const PROVEEDORES = {
  claude: { variable: 'ANTHROPIC_API_KEY', fn: claude },
  openai: { variable: 'OPENAI_API_KEY',    fn: openai },
  gemini: { variable: 'GEMINI_API_KEY',    fn: gemini },
  groq:   { variable: 'GROQ_API_KEY',      fn: groq   },
};

async function preguntar(prompt) {
  const orden = (env('BOT_ORDEN') || 'claude,gemini,openai,groq')
    .split(',').map(s => s.trim()).filter(n => PROVEEDORES[n]);

  const fallos = [];
  let huboKey = false;

  for (const nombre of orden) {
    const { variable, fn } = PROVEEDORES[nombre];
    const key = env(variable);
    if (!key) continue;
    huboKey = true;
    try { return { datos: await fn(key, prompt), via: nombre }; }
    catch (e) { fallos.push(nombre + ': ' + String(e.message || e).slice(0, 90)); }
  }

  if (!huboKey) throw new Error('No hay ninguna API key configurada en Netlify');
  throw new Error(fallos.join(' · '));
}

// ── La entrada ──────────────────────────────────────────────────────────
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/**
 * Deja una tarea corriendo DESPUÉS de haber respondido.
 *
 * Por qué importa: guardar la conversación y mandar el correo tardan entre
 * medio segundo y dos. Si se esperan, el paciente con dolor torácico ve su
 * instrucción de llamar al 911 dos segundos más tarde. Con waitUntil, Netlify
 * mantiene viva la función mientras la tarea termina, pero la respuesta ya
 * salió. Si el entorno no lo trae, se espera: mejor lento que perder el aviso.
 */
function enSegundoPlano(context, promesa) {
  const p = Promise.resolve(promesa).catch(() => {});
  if (typeof context?.waitUntil === 'function') { context.waitUntil(p); return null; }
  return p;
}

export async function manejar(req, context) {
  const url = new URL(req.url);

  // Ping de salud: saber si la función vive sin gastar una llamada de IA.
  if (req.method === 'GET' && url.searchParams.get('ping')) {
    return json({
      ok: true,
      marcasArchivo: Object.keys(MARCAS),
      proveedores: Object.fromEntries(
        Object.entries(PROVEEDORES).map(([n, p]) => [n, !!env(p.variable)])),
      orden: env('BOT_ORDEN') || 'claude,gemini,openai,groq',
      modeloClaude: MODELO_CLAUDE,
      base: !!(env('SUPABASE_URL') && env('SUPABASE_SERVICE_KEY')),
      cifrado: !!env('CHATBOT_CLAVE'),
      correo: !!env('RESEND_API_KEY'),
    });
  }

  // Config: lo que el widget necesita para pintarse. Solo lo visible.
  if (req.method === 'GET' && url.searchParams.get('config')) {
    return json(await configPublica(url.searchParams.get('marca')));
  }

  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!permitir(req)) return json({ error: 'Demasiados mensajes seguidos. Espera unos minutos.' }, 429);

  let cuerpo;
  try { cuerpo = await req.json(); }
  catch { return json({ error: 'Cuerpo inválido' }, 400); }

  const { marca: marcaId, mensajes, tipo, lead, sesion } = cuerpo || {};

  // La marca sale de la base si está ahí; si no, del archivo.
  const marca = await resolverMarca(marcaId);
  if (marca.suspendida) {
    return json({ texto: 'Este chat está fuera de servicio por el momento.',
                  sugerencias: [], accion: 'ninguna', via: 'suspendida' });
  }

  // ── Rama 1: la persona mandó el formulario de contacto ────────────────
  if (tipo === 'lead') {
    if (!lead?.nombre || !lead?.telefono) return json({ error: 'Falta nombre o teléfono' }, 400);
    if (!lead.consiente) return json({ error: 'Falta aceptar el aviso de privacidad' }, 400);

    try {
      await guardarLead({ empresa: marca, lead });
    } catch (e) {
      // Si no se pudo guardar, la persona NO se queda colgada: se le dice y
      // se le ofrece el contacto directo. Perder su intención es lo caro.
      return json({ ok: false,
        error: 'No pude registrar tu solicitud. Escríbenos por WhatsApp, por favor.',
        detalle: String(e.message || e).slice(0, 160) }, 502);
    }

    // El aviso va DESPUÉS de guardar y no retrasa la confirmación: si el
    // correo falla, el dato ya quedó a salvo en la base.
    enSegundoPlano(context, avisar({
      empresa: marca, tipo: 'lead',
      titulo: 'Alguien quiere que le llamen',
      lineas: [
        'Nombre: <b>' + String(lead.nombre).slice(0, 80).replace(/[<>&]/g, '') + '</b>',
        'Contacto: <b>' + String(lead.telefono).slice(0, 40).replace(/[<>&]/g, '') + '</b>',
        lead.motivo ? 'Escribió: ' + String(lead.motivo).slice(0, 300).replace(/[<>&]/g, '') : '',
      ].filter(Boolean),
    }));

    return json({ ok: true, texto: marca.captura?.confirmacion || 'Listo, ya quedaron tus datos.' });
  }

  // ── Rama 2: conversación normal ───────────────────────────────────────
  if (!Array.isArray(mensajes) || !mensajes.length) return json({ error: 'Faltan mensajes' }, 400);
  const ultimo = mensajes.filter(m => m.rol === 'usuario').at(-1)?.texto || '';

  // Un mensaje larguísimo no es una duda: es alguien probando cuánto aguanta
  // el prompt. Se corta antes de pagarlo.
  if (ultimo.length > 1000) return json({ error: 'Ese mensaje es muy largo. Resúmelo, por favor.' }, 400);

  // EL FILTRO. Corre en el servidor aunque el navegador ya lo haya corrido:
  // el widget se puede editar desde la consola, esto no.
  const inmediata = respuestaInmediata(marca, ultimo);
  if (inmediata) {
    // ORDEN DELIBERADO: la instrucción de llamar al 911 sale YA. Guardar la
    // conversación y avisarte queda corriendo detrás, sin retrasarla.
    enSegundoPlano(context, (async () => {
      const conversacionId = await guardarConversacion({
        empresa: marca, sesion, mensajes,
        urgencia: true, motivo: inmediata.motivo, via: 'filtro-local',
      });
      await avisar({
        empresa: marca, tipo: 'urgencia', conversacionId,
        titulo: 'Posible urgencia: ' + (inmediata.motivo || 'sin clasificar'),
        lineas: [
          'Ocurrió a las <b>' + new Date().toLocaleString('es-MX') + '</b>.',
          'La conversación completa está en el panel, cifrada.',
        ],
      });
    })());

    return json(inmediata);
  }

  try {
    const { datos, via } = await preguntar(construirPrompt(marca, mensajes));
    const salida = {
      texto: String(datos.texto || '').slice(0, 1200),
      sugerencias: Array.isArray(datos.sugerencias) ? datos.sugerencias.slice(0, 3).map(String) : [],
      accion: ['capturar_cita', 'derivar_humano'].includes(datos.accion) ? datos.accion : 'ninguna',
      via,
    };

    enSegundoPlano(context, guardarConversacion({
      empresa: marca, sesion,
      mensajes: [...mensajes, { rol: 'bot', texto: salida.texto }],
      urgencia: false, via,
    }));

    return json(salida);
  } catch (e) {
    // Si todos los proveedores fallan, el chat no se queda mudo: contesta
    // algo útil y manda a un humano. Un bot que dice "error" es peor que
    // no tener bot.
    return json({
      texto: 'Se me trabó la conexión. Escríbenos directo y te atendemos ahí mismo.',
      sugerencias: [], accion: 'derivar_humano', via: 'error',
      detalle: String(e.message || e).slice(0, 180),
    });
  }
}
