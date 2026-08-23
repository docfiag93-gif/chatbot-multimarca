// ════════════════════════════════════════════════════════════════════════
//  TELEGRAM  ·  el canal que no pide permiso a nadie
//
//  Existe por una razón muy concreta: WhatsApp, Instagram y Facebook pasan
//  por trámites de Meta que tardan semanas. Telegram no. Se crea un bot
//  hablando con @BotFather, sale un token en dos minutos, y ya. Sin
//  verificación de negocio, sin número dedicado, sin costo.
//
//  Para qué sirve de verdad:
//    · Probar el cerebro en un mensajero real HOY, sin esperar a nadie.
//    · Enseñarle a un colega cómo contesta, en su propio celular.
//    · Tener un canal de respaldo el día que Meta suspenda algo.
//
//  Mismo cerebro que la web y que WhatsApp. Aquí NO se decide nada: se
//  traduce. Si esto tuviera lógica propia, en una semana estaría diciendo
//  cosas distintas a los otros dos canales.
// ════════════════════════════════════════════════════════════════════════

import { env } from './nucleo/entorno.mjs';
import { construirPrompt, decidirSinIA } from './nucleo/cerebro.mjs';
import { preguntar } from './nucleo/proveedores.mjs';
import { revisarAnclaje, pulir, respuestaSinDato } from './nucleo/anclaje.mjs';
import { explicarFallo } from './nucleo/diagnostico.mjs';
import { resolverMarca, guardarConversacion, avisar } from './nucleo/datos.mjs';

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });

/* La charla en curso. Igual que en WhatsApp: no hay pestaña que cerrar, la
   misma persona escribe hoy y en tres días. */
const HILOS = new Map();
const MAX_HILO = 12;

function recordar(clave, mensaje) {
  const hilo = HILOS.get(clave) || [];
  hilo.push(mensaje);
  while (hilo.length > MAX_HILO) hilo.shift();
  HILOS.set(clave, hilo);
  return hilo;
}

async function enviar(chatId, texto, opciones) {
  const token = env('TELEGRAM_TOKEN');
  if (!token) return { ok: false };

  const cuerpo = {
    chat_id: chatId,
    text: String(texto).slice(0, 4000),
    // Sin formato: el texto viene de un modelo, y Telegram rechaza el
    // mensaje entero si el Markdown viene mal cerrado. Un asterisco suelto
    // no puede costar la respuesta.
    disable_web_page_preview: true,
  };

  // Las sugerencias como botones. Telegram no tiene el tope de tres de
  // WhatsApp, pero se respeta el mismo: más de tres opciones dejan de
  // ayudar y empiezan a estorbar.
  if (opciones?.length) {
    cuerpo.reply_markup = {
      keyboard: opciones.slice(0, 3).map(o => [{ text: String(o).slice(0, 60) }]),
      resize_keyboard: true, one_time_keyboard: true,
    };
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { ok: r.ok };
}

export async function manejar(req, context = {}) {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

  /* Telegram permite fijar un secreto al dar de alta el webhook y lo repite
     en cada llamada. Sin esto, la URL es pública y cualquiera podría
     inyectar mensajes falsos: el bot contestaría, guardaría conversaciones
     inventadas y quemaría la cuota de IA de alguien más. */
  const esperado = env('TELEGRAM_SECRETO');
  if (esperado && req.headers.get('x-telegram-bot-api-secret-token') !== esperado) {
    return new Response('no', { status: 403 });
  }

  let cuerpo;
  try { cuerpo = await req.json(); } catch { return json({ ok: true }); }

  const msg = cuerpo?.message || cuerpo?.edited_message;
  const texto = msg?.text;
  const chatId = msg?.chat?.id;
  // Siempre 200: un error hace que Telegram reintente el mismo mensaje una
  // y otra vez.
  if (!texto || !chatId) return json({ ok: true });

  // Qué negocio atiende. Va en la URL del webhook porque un bot de Telegram
  // pertenece a uno solo — no hay un «a qué número le escribieron».
  const url = new URL(req.url);
  const slug = url.searchParams.get('marca') || env('TELEGRAM_MARCA') || 'default';
  const marca = await resolverMarca(slug);

  if (marca?.suspendida) {
    await enviar(chatId, 'Este chat está fuera de servicio por el momento.');
    return json({ ok: true });
  }

  // `/start` es lo primero que manda Telegram al abrir un bot. Se contesta
  // con el saludo del negocio, no metiéndolo a la IA: gastar una llamada de
  // modelo en un «hola» automático es tirar cuota.
  if (texto.trim() === '/start') {
    await enviar(chatId, marca.saludo || 'Hola, ¿en qué te ayudo?', marca.sugerencias);
    return json({ ok: true });
  }

  const clave = 'tg:' + chatId;
  const mensajes = recordar(clave, { rol: 'usuario', texto });
  const hayContacto = !!(marca.contactos && Object.keys(marca.contactos).length);
  const modo = marca.modo || 'activo';

  // El MISMO orden que en la web y en WhatsApp.
  let salida = decidirSinIA({ marca, modo, ultimo: texto, hayContacto });

  if (!salida) {
    try {
      const { datos, via } = await preguntar({
        marca, prompt: construirPrompt(marca, mensajes), leerEntorno: env,
      });
      const limpio = pulir(datos.texto || '').texto;
      const anclaje = revisarAnclaje(marca, limpio);
      salida = anclaje.anclado
        ? { ...datos, texto: limpio, via }
        : { ...respuestaSinDato(marca, anclaje.inventadas), via, anclaje: 'degradado' };
    } catch (e) {
      const f = explicarFallo(e, { hayContacto });
      salida = { texto: f.publico, sugerencias: [], via: 'error' };
    }
  }

  recordar(clave, { rol: 'bot', texto: salida.texto });
  await enviar(chatId, salida.texto, salida.sugerencias);

  // Guardar y avisar van DETRÁS de la respuesta. En una urgencia, cada
  // segundo de retraso es un segundo sin el 911.
  const detras = (async () => {
    const esUrgencia = salida.corte === 'urgencia';
    const conversacionId = await guardarConversacion({
      empresa: marca, sesion: clave.slice(0, 64), mensajes,
      urgencia: esUrgencia, motivo: salida.motivo,
      via: 'telegram:' + (salida.via || ''),
      sinDato: salida.anclaje === 'degradado',
    });
    if (esUrgencia) {
      await avisar({
        empresa: marca, tipo: 'urgencia', conversacionId,
        titulo: 'Posible urgencia por Telegram: ' + (salida.motivo || 'sin clasificar'),
        lineas: ['Entró a las <b>' + new Date().toLocaleString('es-MX') + '</b>.'],
      });
    }
  })();
  if (context.waitUntil) context.waitUntil(detras); else await detras;

  return json({ ok: true });
}
