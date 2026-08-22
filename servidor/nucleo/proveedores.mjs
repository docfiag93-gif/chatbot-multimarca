// ════════════════════════════════════════════════════════════════════════
//  Adaptador de proveedores de IA
//
//  Un solo lugar decide QUIÉN contesta, CON QUÉ LLAVE y QUÉ PASA si falla.
//  Antes esto vivía disperso en bot.mjs y arrastraba seis defectos:
//
//   · Sin tiempo límite. Un proveedor colgado bloqueaba la petición entera y
//     el respaldo nunca llegaba a entrar — justo cuando más falta hacía.
//   · Sin reintento. Un 503 pasajero descartaba al proveedor completo.
//   · Las llaves propias de cada marca se descifraban y se tiraban: la cadena
//     solo miraba el entorno global.
//   · El caché del modelo se guardaba sin considerar la llave, así que al
//     rotarla se seguía usando el modelo descubierto con la anterior.
//   · Gemini y Groq hacían JSON.parse crudo mientras los otros dos usaban un
//     extractor tolerante. Misma respuesta, dos comportamientos.
//   · El mensaje de error nombraba una plataforma equivocada y no decía
//     qué hacer para arreglarlo.
//
//  REGLA DURA DE ESTE ARCHIVO: ninguna llave sale de aquí. No se registra,
//  no se devuelve en errores, no se pone en una URL que pueda quedar en un
//  log. Lo único que viaja hacia afuera es el NOMBRE del proveedor.
// ════════════════════════════════════════════════════════════════════════

const GEMINI    = 'https://generativelanguage.googleapis.com/v1beta';
const GROQ      = 'https://api.groq.com/openai/v1';
const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI    = 'https://api.openai.com/v1';

export const ORDEN_POR_OMISION = 'gemini,groq';

// Tiempo máximo por intento. Corto a propósito: si un proveedor no contestó
// en 15 s, esperar más no mejora la respuesta, solo retrasa el respaldo que
// sí va a contestar. La persona del otro lado está viendo puntos suspensivos.
export const MS_LIMITE = 15000;

// Un reintento, no más. Dos reintentos por proveedor y cuatro proveedores
// dan dieciséis intentos: el usuario abandona mucho antes de que terminen.
export const REINTENTOS = 1;

/* ── utilidades ──────────────────────────────────────────────────────── */

// Los mensajes de error de los proveedores a veces traen la llave dentro
// (Google la manda en la URL). Se limpia SIEMPRE, no solo cuando se recuerda.
export function limpiar(texto) {
  return String(texto ?? '')
    .replace(/key=[^&\s"']+/gi, 'key=***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
    .replace(/gsk_[A-Za-z0-9_-]{10,}/g, 'gsk_***')
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, 'AIza***');
}

// Huella de la llave para usarla como clave de caché sin guardarla entera.
// No es criptográfica y no pretende serlo: solo distingue una llave de otra.
function huella(key) {
  const s = String(key || '');
  return s.length + ':' + s.slice(0, 3) + s.slice(-3);
}

class ErrorProveedor extends Error {
  constructor(mensaje, { estado = 0, reintentable = false } = {}) {
    super(limpiar(mensaje));
    this.estado = estado;
    this.reintentable = reintentable;
  }
}

// 429 y 5xx son pasajeros: vale la pena reintentar.
// 400/401/403 son de configuración: reintentar solo gasta tiempo.
function esReintentable(estado) {
  return estado === 408 || estado === 429 || estado >= 500;
}

/**
 * fetch con tiempo límite. Sin esto, una petición colgada se lleva la
 * petición entera: en el borde no hay quien la interrumpa.
 */
async function pedir(url, opciones = {}, ms = MS_LIMITE) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: corte.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ErrorProveedor(`no contestó en ${ms / 1000} s`, { estado: 408, reintentable: true });
    }
    throw new ErrorProveedor('fallo de red: ' + (e?.message || e), { estado: 0, reintentable: true });
  } finally {
    clearTimeout(reloj);
  }
}

async function fallar(r, etiqueta) {
  const t = await r.text().catch(() => '');
  throw new ErrorProveedor(`${etiqueta} ${r.status} ${t.slice(0, 140)}`, {
    estado: r.status,
    reintentable: esReintentable(r.status),
  });
}

/**
 * Extrae JSON aunque venga envuelto en ```json o con texto alrededor.
 * Antes solo lo usaban dos de los cuatro proveedores; ahora los cuatro.
 */
export function extraerJSON(txt) {
  const limpio = String(txt).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try { return JSON.parse(limpio); }
  catch {
    const m = limpio.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* cae abajo */ } }
    throw new ErrorProveedor('no devolvió JSON válido');
  }
}

/* ── descubrimiento de modelos ───────────────────────────────────────── */
//  El caché se guarda POR HUELLA DE LLAVE, no global. Dos marcas con llaves
//  distintas pueden tener acceso a modelos distintos, y una llave rotada
//  no debe heredar el modelo de la anterior.

const TTL = 6 * 60 * 60 * 1000;
const _modelos = new Map();

function cacheado(proveedor, key) {
  const v = _modelos.get(proveedor + '|' + huella(key));
  return v && Date.now() - v.ts < TTL ? v.modelo : null;
}
function guardar(proveedor, key, modelo) {
  _modelos.set(proveedor + '|' + huella(key), { modelo, ts: Date.now() });
}
function olvidar(proveedor, key) {
  _modelos.delete(proveedor + '|' + huella(key));
}
export function _limpiarCacheModelos() { _modelos.clear(); }

/* ── proveedores ─────────────────────────────────────────────────────── */

async function modeloGemini(key, ms) {
  const previo = cacheado('gemini', key);
  if (previo) return previo;

  // El límite se pasa TAMBIÉN aquí: descubrir el modelo es una llamada de red
  // como cualquier otra, y si se cuelga bloquea igual que la otra.
  const r = await pedir(`${GEMINI}/models?key=${encodeURIComponent(key)}`, {}, ms);
  if (!r.ok) await fallar(r, 'gemini/modelos');
  const { models = [] } = await r.json();

  const utiles = models.filter(m =>
    (m.supportedGenerationMethods || []).includes('generateContent') &&
    !/embedding|aqa|imagen|veo|tts/i.test(m.name || ''));
  // Los "preview" y "exp" NO entran en la capa gratuita: ya devolvieron 429
  // en producción. Se prefiere lo estable aunque sea una versión atrás.
  const estable = m => !/preview|thinking|\bexp\b|experimental/i.test(m.name || '');
  const flash = utiles.filter(m => /flash/i.test(m.name) && estable(m));
  const pool = flash.length ? flash : (utiles.filter(estable).length ? utiles.filter(estable) : utiles);
  if (!pool.length) throw new ErrorProveedor('la llave no tiene modelos de texto disponibles', { estado: 403 });

  pool.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'en', { numeric: true }));
  guardar('gemini', key, pool[0].name);
  return pool[0].name;
}

async function gemini(key, prompt, ms) {
  const modelo = await modeloGemini(key, ms);
  const r = await pedir(`${GEMINI}/${modelo}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 700, responseMimeType: 'application/json' },
    }),
  }, ms);

  if (!r.ok) {
    // Si el modelo elegido murió o se quedó sin cuota, se tira el caché para
    // que el próximo intento vuelva a elegir en vez de insistir seis horas.
    if ([400, 404, 429].includes(r.status)) olvidar('gemini', key);
    await fallar(r, 'gemini');
  }
  const j = await r.json();
  const txt = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!txt) throw new ErrorProveedor('respuesta vacía', { estado: 502, reintentable: true });
  return extraerJSON(txt);
}

async function modeloGroq(key, ms) {
  const previo = cacheado('groq', key);
  if (previo) return previo;

  const r = await pedir(`${GROQ}/models`, { headers: { Authorization: 'Bearer ' + key } }, ms);
  if (!r.ok) await fallar(r, 'groq/modelos');
  const { data = [] } = await r.json();

  const utiles = data.filter(m => !/whisper|tts|guard|vision/i.test(m.id || ''));
  if (!utiles.length) throw new ErrorProveedor('la llave no tiene modelos de texto disponibles', { estado: 403 });
  // Un "instant"/8b alcanza de sobra para atender una consulta y deja los
  // modelos grandes libres para lo que sí los necesite.
  const rapido = utiles.filter(m => /instant|8b/i.test(m.id));
  const elegido = (rapido.length ? rapido : utiles)[0].id;
  guardar('groq', key, elegido);
  return elegido;
}

async function groq(key, prompt, ms) {
  const modelo = await modeloGroq(key, ms);
  const r = await pedir(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6, max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  }, ms);

  if (!r.ok) {
    if ([404, 429].includes(r.status)) olvidar('groq', key);
    await fallar(r, 'groq');
  }
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || '';
  if (!txt) throw new ErrorProveedor('respuesta vacía', { estado: 502, reintentable: true });
  return extraerJSON(txt);
}

async function claude(key, prompt, ms, opciones = {}) {
  const r = await pedir(`${ANTHROPIC}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opciones.modelo || 'claude-opus-5',
      max_tokens: 2048,
      // OJO: 'budget_tokens' ya NO existe en Opus 5 — mandarlo devuelve 400.
      // La profundidad del razonamiento va en output_config.effort.
      thinking: { type: 'adaptive' },
      output_config: { effort: opciones.esfuerzo || 'high' },
      messages: [{ role: 'user', content: prompt }],
    }),
  }, ms);

  if (!r.ok) await fallar(r, 'claude');
  const j = await r.json();

  // Un rechazo del clasificador llega como HTTP 200. Si no se revisa, se lee
  // content vacío y parece un fallo del modelo. Se trata como error para que
  // la cadena pase al siguiente en vez de devolver una burbuja en blanco.
  if (j.stop_reason === 'refusal') {
    throw new ErrorProveedor('rechazado por el clasificador (' + (j.stop_details?.category || 'sin categoría') + ')', { estado: 451 });
  }
  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!txt) throw new ErrorProveedor('respuesta vacía', { estado: 502, reintentable: true });
  return extraerJSON(txt);
}

async function modeloOpenAI(key, ms) {
  const previo = cacheado('openai', key);
  if (previo) return previo;
  const r = await pedir(`${OPENAI}/models`, { headers: { Authorization: 'Bearer ' + key } }, ms);
  if (!r.ok) await fallar(r, 'openai/modelos');
  const { data = [] } = await r.json();
  const utiles = data.filter(m => /^gpt/i.test(m.id || '') &&
    !/audio|realtime|transcribe|tts|image|search|embedding/i.test(m.id));
  if (!utiles.length) throw new ErrorProveedor('la llave no tiene modelos de chat', { estado: 403 });
  utiles.sort((a, b) => (b.id || '').localeCompare(a.id || '', 'en', { numeric: true }));
  guardar('openai', key, utiles[0].id);
  return utiles[0].id;
}

async function openai(key, prompt, ms) {
  const modelo = await modeloOpenAI(key, ms);
  const r = await pedir(`${OPENAI}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  }, ms);
  if (!r.ok) {
    if ([404, 429].includes(r.status)) olvidar('openai', key);
    await fallar(r, 'openai');
  }
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || '';
  if (!txt) throw new ErrorProveedor('respuesta vacía', { estado: 502, reintentable: true });
  return extraerJSON(txt);
}

export const CATALOGO = {
  gemini: { variable: 'GEMINI_API_KEY',    fn: gemini, etiqueta: 'Gemini' },
  groq:   { variable: 'GROQ_API_KEY',      fn: groq,   etiqueta: 'Groq'   },
  claude: { variable: 'ANTHROPIC_API_KEY', fn: claude, etiqueta: 'Claude' },
  openai: { variable: 'OPENAI_API_KEY',    fn: openai, etiqueta: 'OpenAI' },
};

/* ── el plan: quién intenta, en qué orden, con qué llave ─────────────── */

/**
 * Decide la cadena para UNA marca concreta. Tres niveles de precedencia:
 *
 *   1. La marca elige su orden      (marca.proveedores)
 *   2. La instalación elige         (BOT_ORDEN en el entorno)
 *   3. Por omisión                  (gemini, groq)
 *
 * Y para cada proveedor, la llave de la marca gana sobre la del entorno: así
 * un cliente puede traer su propia cuenta y pagar su propio consumo, sin que
 * eso afecte a las demás marcas ni obligue a tocar código.
 *
 * `origen` viaja en el plan para poder depurar sin mirar llaves.
 */
export function planDeProveedores({ marca = {}, leerEntorno }) {
  const crudo = (Array.isArray(marca.proveedores) && marca.proveedores.length)
    ? marca.proveedores.join(',')
    : (leerEntorno('BOT_ORDEN') || ORDEN_POR_OMISION);

  const nombres = String(crudo).split(',').map(s => s.trim().toLowerCase())
    .filter(n => CATALOGO[n]);

  // Sin duplicados: repetir un proveedor solo multiplica la espera.
  const vistos = new Set();
  const plan = [];
  for (const nombre of nombres) {
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);

    const propia = marca.llaves && marca.llaves[nombre];
    const global = leerEntorno(CATALOGO[nombre].variable);
    const key = propia || global;
    if (!key) continue;

    plan.push({ nombre, key, origen: propia ? 'marca' : 'plataforma' });
  }
  return plan;
}

/**
 * Pregunta siguiendo el plan. Devuelve { datos, via, origen, intentos }.
 *
 * `intentos` es la lista de lo que se probó y por qué falló, ya limpia de
 * secretos. Sirve para depurar en el panel sin abrir los registros del
 * servidor — y para que el mensaje de error al usuario pueda ser honesto.
 */
export async function preguntar({ marca = {}, prompt, leerEntorno, msLimite = MS_LIMITE, reintentos = REINTENTOS, opciones = {} }) {
  const plan = planDeProveedores({ marca, leerEntorno });

  if (!plan.length) {
    const e = new Error('SIN_PROVEEDORES');
    e.codigo = 'SIN_PROVEEDORES';
    e.intentos = [];
    throw e;
  }

  const intentos = [];

  for (const { nombre, key, origen } of plan) {
    for (let vuelta = 0; vuelta <= reintentos; vuelta++) {
      try {
        const datos = await CATALOGO[nombre].fn(key, prompt, msLimite, opciones);
        return { datos, via: nombre, origen, intentos };
      } catch (e) {
        const detalle = limpiar(e?.message || String(e)).slice(0, 120);
        intentos.push({ proveedor: nombre, origen, vuelta, estado: e?.estado ?? 0, detalle });

        // Solo se reintenta lo pasajero, y solo si queda vuelta.
        if (!e?.reintentable || vuelta === reintentos) break;
        // Espera corta antes del reintento: suficiente para que un pico pase,
        // no tanta como para que la persona crea que se colgó.
        await new Promise(r => setTimeout(r, 400 * (vuelta + 1)));
      }
    }
  }

  const e = new Error('TODOS_FALLARON');
  e.codigo = 'TODOS_FALLARON';
  e.intentos = intentos;
  throw e;
}
