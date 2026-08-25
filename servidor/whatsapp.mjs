// ════════════════════════════════════════════════════════════════════════
//  WHATSAPP  ·  el bot contestando dentro de WhatsApp
//
//  Mismo cerebro que la web. Aquí NO se decide nada: se traduce.
//  WhatsApp habla en su formato, el núcleo habla en el suyo, y este archivo
//  es el intérprete. Todo lo que importa —las políticas clínicas, el
//  anclaje contra invenciones, el interruptor del bot— corre igual, porque
//  vive en el núcleo y no aquí.
//
//  Si algún día esto se duplicara —«un cerebro para la web y otro para
//  WhatsApp»— sería cuestión de semanas antes de que uno mandara al 911 y
//  el otro no.
//
//  QUÉ HACE FALTA DEL LADO DE META:
//    WHATSAPP_TOKEN          token de la app (empieza temporal, 24 h)
//    WHATSAPP_VERIFY_TOKEN   una palabra que tú inventas; Meta la repite
//                            al dar de alta el webhook, para probar que el
//                            servidor es tuyo
//  Y en cada negocio, su `whatsapp_id` (el phone_number_id que da Meta).
// ════════════════════════════════════════════════════════════════════════

import { env } from './nucleo/entorno.mjs';
import { construirPrompt, decidirSinIA } from './nucleo/cerebro.mjs';
import { preguntar } from './nucleo/proveedores.mjs';
import { revisarAnclaje, pulir, respuestaSinDato } from './nucleo/anclaje.mjs';
import { explicarFallo } from './nucleo/diagnostico.mjs';
import { empresaPorWhatsapp, guardarConversacion, avisar, servicio } from './nucleo/datos.mjs';

const GRAFO = 'https://graph.facebook.com/v21.0';

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });

/**
 * La memoria de una charla de WhatsApp.
 *
 * No hay pestaña que cerrar: la misma persona escribe hoy y en tres días, y
 * el hilo debe continuar. Se guardan los últimos mensajes en memoria del
 * worker —barato y suficiente— y la conversación completa, cifrada, en la
 * base, igual que en la web.
 */
const HILOS = new Map();
const MAX_HILO = 12;

function recordar(clave, mensaje) {
  const hilo = HILOS.get(clave) || [];
  hilo.push(mensaje);
  while (hilo.length > MAX_HILO) hilo.shift();
  HILOS.set(clave, hilo);
  return hilo;
}

/** Manda un mensaje de texto por WhatsApp. */
/**
 * El número al que de verdad se puede contestar.
 *
 * México y Argentina arrastran un dígito extra en WhatsApp por razones
 * históricas de su numeración: un `1` después del 52, un `9` después del 54.
 * WhatsApp lo manda así en el mensaje ENTRANTE —tanto en `from` como en
 * `wa_id`— y la API lo RECHAZA al enviar: para ella `5219616552222` y
 * `529616552222` son dos números distintos, y solo el segundo está en la
 * lista de destinatarios permitidos.
 *
 * El síntoma es de los que enloquecen: el mensaje entra, la IA contesta, la
 * conversación se guarda, y Meta responde 131030 «el destinatario no está en
 * la lista» señalando un número que SÍ está en la lista. Está, pero escrito
 * de la otra forma.
 *
 * Solo se toca cuando el patrón calza EXACTO —país, dígito y largo—. Ante
 * cualquier otra cosa se devuelve tal cual: inventarle dígitos al teléfono de
 * alguien es peor que no contestarle.
 */
export function aQuienSeLeContesta(numero) {
  const n = String(numero || '').replace(/\D/g, '');
  // México: 52 + 1 + diez dígitos → se quita el 1.
  if (/^521\d{10}$/.test(n)) return '52' + n.slice(3);
  // Argentina: 54 + 9 + diez dígitos → se quita el 9.
  if (/^549\d{10}$/.test(n)) return '54' + n.slice(3);
  return n || String(numero || '');
}

async function responderPorWhatsapp({ phoneId, para, texto }) {
  const token = env('WHATSAPP_TOKEN');
  if (!token || !phoneId) return { ok: false, razon: 'sin_token' };

  const r = await fetch(`${GRAFO}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: aQuienSeLeContesta(para),
      type: 'text',
      text: { preview_url: false, body: String(texto).slice(0, 4000) },
    }),
  });
  if (!r.ok) {
    /* Se rescata el CÓDIGO numérico de Meta, que es lo que de verdad dice qué
       pasó: 131030 es «el destinatario no está en la lista permitida», 131026
       es «no se pudo entregar», 190 es «token vencido». Sin él, un 400 pelado
       obliga a adivinar entre cinco causas distintas.

       Solo el número y el subcódigo. NUNCA el cuerpo completo ni el mensaje
       de Meta: ahí puede venir de vuelta el número de la persona, y este
       registro lo lee el superadmin de la plataforma, que no es el dueño del
       consultorio. */
    let codigo = null, sub = null;
    try {
      const e = (await r.json())?.error;
      codigo = Number(e?.code) || null;
      sub = Number(e?.error_subcode) || null;
    } catch (err) { /* sin cuerpo legible: queda el status */ }
    return { ok: false, razon: 'meta_' + r.status, codigo, sub };
  }
  return { ok: true };
}

/**
 * Los botones de respuesta rápida de WhatsApp. Hasta TRES, es el máximo que
 * acepta Meta, y da la casualidad de que es el mismo número de sugerencias
 * que ya devuelve el núcleo.
 */
async function responderConBotones({ phoneId, para, texto, opciones }) {
  const token = env('WHATSAPP_TOKEN');
  if (!token || !phoneId) return { ok: false, razon: 'sin_token' };

  const botones = opciones.slice(0, 3).map((o, i) => ({
    type: 'reply',
    reply: { id: 'op' + i, title: String(o).slice(0, 20) },   // 20 chars, tope de Meta
  }));

  const r = await fetch(`${GRAFO}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: para, type: 'interactive',
      interactive: { type: 'button', body: { text: String(texto).slice(0, 1024) },
                     action: { buttons: botones } },
    }),
  });
  // Un texto que no cabe en el cuerpo de un interactivo no debe perderse:
  // si falla, se manda como texto plano.
  if (!r.ok) return responderPorWhatsapp({ phoneId, para, texto });
  return { ok: true };
}

/** Saca el mensaje entrante del envoltorio de Meta, que va anidado hondo. */
function leerEntrante(cuerpo) {
  const v = cuerpo?.entry?.[0]?.changes?.[0]?.value;
  const m = v?.messages?.[0];
  if (!m) return null;                      // estados de entrega y demás: se ignoran

  const texto = m.type === 'text' ? m.text?.body
              : m.type === 'interactive' ? (m.interactive?.button_reply?.title ||
                                            m.interactive?.list_reply?.title)
              : null;

  return {
    phoneId: v?.metadata?.phone_number_id,
    /* Se contesta al `wa_id` de contactos, NO al `from` del mensaje.
       Casi siempre son idénticos, pero en México no: WhatsApp arrastra un
       «1» extra después del 52 —`5219616552222` en vez de `529616552222`—
       por razones históricas del numeración mexicana. Meta acepta el mensaje
       entrante con ese formato y RECHAZA el envío de vuelta.
       `wa_id` es el identificador canónico y es el que Meta documenta para
       responder. El `from` se queda de respaldo por si algún día falta. */
    de: v?.contacts?.[0]?.wa_id || m.from,
    texto: texto || '',
    tipo: m.type,
    nombre: v?.contacts?.[0]?.profile?.name || '',
  };
}


/* ══════════════════════════════════════════════════════════════════════
   LA FIRMA  ·  comprobar que el mensaje viene de Meta y no de cualquiera

   La URL del webhook es pública. Sin esta comprobación, cualquiera que la
   descubra puede mandarle mensajes inventados: el bot contestaría, se
   guardarían conversaciones falsas en el expediente del negocio, y se
   quemaría la cuota de IA de un cliente que no hizo nada.

   Meta firma cada envío con HMAC-SHA256 sobre el CUERPO CRUDO, usando el
   secreto de la app. Aquí se recalcula y se compara.

   DOS DETALLES QUE ARRUINAN ESTO SI SE HACEN MAL:

   1. Hay que firmar el texto EXACTO que llegó. Si se hace `req.json()` y
      luego `JSON.stringify()`, el resultado casi nunca es idéntico —cambia
      el orden de las llaves, los espacios, cómo se escapan los acentos— y
      la firma no coincide nunca. Por eso el cuerpo se lee UNA vez como
      texto y de ahí se parsea.

   2. La comparación es en tiempo constante. Un `===` normal se rinde en el
      primer byte distinto, y ese tiempo, medido muchas veces, deja
      adivinar la firma correcta byte por byte. Cuesta lo mismo hacerlo
      bien.
   ══════════════════════════════════════════════════════════════════════ */
async function firmaValida(secreto, cuerpoCrudo, cabecera) {
  if (!cabecera || !cabecera.startsWith('sha256=')) return false;

  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(cuerpoCrudo));

  const esperado = [...new Uint8Array(firma)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const recibido = cabecera.slice('sha256='.length).toLowerCase();

  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return diferencia === 0;
}

export async function manejar(req, context = {}) {
  const url = new URL(req.url);

  /* ── El apretón de manos ───────────────────────────────────────────────
     Meta llama con GET una sola vez, al dar de alta el webhook, y espera
     que le devuelvas su `challenge` TAL CUAL, en texto plano, solo si la
     palabra secreta coincide. Es su forma de comprobar que el servidor es
     de quien dice. */
  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode');
    const testigo = url.searchParams.get('hub.verify_token');
    const reto = url.searchParams.get('hub.challenge');
    const esperado = env('WHATSAPP_VERIFY_TOKEN');

    if (modo === 'subscribe' && esperado && testigo === esperado) {
      return new Response(reto || '', { status: 200, headers: { 'content-type': 'text/plain' } });
    }

    /* Al de afuera se le sigue contestando un «no» pelado —a quien no es Meta
       no se le explica qué le faltó— PERO el dato no se tira.

       Sin esto, el dueño ve en Meta «no se pudo validar la URL» y no tiene
       forma de saber si escribió mal la palabra secreta o si la variable ni
       siquiera existe en el servidor. Son dos problemas distintos, en dos
       lugares distintos, y se ven exactamente igual. Es el mismo silencio que
       ya escondió la bitácora vacía y los avisos que no salían.

       Queda en la bitácora, que el superadmin ya mira. Nunca se guarda el
       valor del testigo: solo si coincidió o no. */
    const anotar = (async () => {
      const sb = servicio();
      if (!sb) return;
      await sb.bitacora({
        actor: null, empresa_id: null,
        accion: 'whatsapp.verificacion_rechazada',
        detalle: {
          motivo: !esperado ? 'sin_variable' : (modo !== 'subscribe' ? 'modo_raro' : 'no_coincide'),
          nota: !esperado
            ? 'WHATSAPP_VERIFY_TOKEN no está puesta en el servidor. Ponla en las variables del proyecto y vuelve a desplegar; después reintenta desde Meta.'
            : (modo !== 'subscribe'
               ? 'Llegó una llamada que no era el apretón de manos de Meta.'
               : 'La palabra secreta que mandó Meta NO coincide con WHATSAPP_VERIFY_TOKEN. Cópiala igual en los dos lados.'),
          cuando: new Date().toISOString(),
        },
      });
    })().catch(() => {});

    // Se contesta YA. Meta tiene poca paciencia con el apretón de manos, y
    // esperar a que se escriba la nota solo lograría que además del rechazo
    // hubiera un tiempo agotado.
    if (context.waitUntil) context.waitUntil(anotar); else await anotar;

    return new Response('no', { status: 403 });
  }

  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

  // UNA sola lectura, como texto: la firma se calcula sobre el cuerpo tal
  // cual llegó. Volver a serializarlo desde el objeto rompe la firma.
  const crudo = await req.text();

  const secreto = env('WHATSAPP_APP_SECRET');
  if (secreto) {
    const ok = await firmaValida(secreto, crudo, req.headers.get('x-hub-signature-256'));
    // 403 y sin explicar: a quien no es Meta no se le dice qué le faltó.
    if (!ok) return new Response('no', { status: 403 });
  } else if (env('WHATSAPP_TOKEN')) {
    // Configurado a medias. No se bloquea —cortar los mensajes de un
    // consultorio por una variable que falta sería peor— pero queda dicho.
    console.warn('[whatsapp] Falta WHATSAPP_APP_SECRET: se están aceptando ' +
                 'webhooks SIN comprobar la firma. Cualquiera con la URL puede escribir.');
  }

  let cuerpo;
  try { cuerpo = JSON.parse(crudo); } catch { return json({ ok: true }); }

  const entrante = leerEntrante(cuerpo);
  // SIEMPRE 200, aunque no haya nada que hacer. Un error aquí hace que Meta
  // reintente el mismo mensaje una y otra vez, y acabe desactivando el
  // webhook por «fallando».
  if (!entrante || !entrante.texto) return json({ ok: true });

  const marca = await empresaPorWhatsapp(entrante.phoneId);
  if (!marca || marca.suspendida) {
    if (marca?.suspendida) {
      await responderPorWhatsapp({ phoneId: entrante.phoneId, para: entrante.de,
        texto: 'Este chat está fuera de servicio por el momento.' });
    }
    return json({ ok: true });
  }

  const clave = entrante.phoneId + ':' + entrante.de;
  const mensajes = recordar(clave, { rol: 'usuario', texto: entrante.texto });
  const hayContacto = !!(marca.contactos && Object.keys(marca.contactos).length);
  const modo = marca.modo || 'activo';

  // El MISMO orden que en la web: la urgencia clínica gana sobre el
  // interruptor, y el interruptor gana sobre la IA.
  let salida = decidirSinIA({ marca, modo, ultimo: entrante.texto, hayContacto });

  if (!salida) {
    try {
      const { datos, via } = await preguntar({
        marca, prompt: construirPrompt(marca, mensajes), leerEntorno: env,
      });
      // El MISMO pulido que la web. Cuando cada canal tenía el suyo, este
      // ya se había quedado sin la revisión de redacción.
      const texto = pulir(datos.texto || '').texto;
      const anclaje = revisarAnclaje(marca, texto);
      salida = anclaje.anclado
        ? { ...datos, texto, via }
        : { ...respuestaSinDato(marca, anclaje.inventadas), via, anclaje: 'degradado' };
    } catch (e) {
      const f = explicarFallo(e, { hayContacto });
      salida = { texto: f.publico, sugerencias: [], accion: 'ninguna', via: 'error' };
    }
  }

  recordar(clave, { rol: 'bot', texto: salida.texto });

  const enviar = (salida.sugerencias || []).length
    ? responderConBotones({ phoneId: entrante.phoneId, para: entrante.de,
                            texto: salida.texto, opciones: salida.sugerencias })
    : responderPorWhatsapp({ phoneId: entrante.phoneId, para: entrante.de, texto: salida.texto });

  /* Se mira CÓMO salió. Antes esto era `await enviar;` a secas: la función
     sabía perfectamente por qué había fallado —devuelve `meta_401`,
     `sin_token`, lo que sea— y quien la llamaba tiraba la respuesta.

     El resultado: el mensaje entra, la IA contesta, la conversación se
     guarda... y a la persona no le llega nada. Desde afuera se ve idéntico a
     que el bot esté muerto, y desde adentro no queda una sola pista. Es el
     último eslabón de la cadena y era el único sin registrar.

     Nunca se guarda el token ni el cuerpo del error de Meta: solo el código.
     El cuerpo puede traer el token de vuelta. */
  const salioAsi = await enviar;

  if (salioAsi && salioAsi.ok === false) {
    /* Los códigos de Meta dicen la verdad; el status HTTP solo dice «400».
       Traducidos a lo que hay que HACER, no a lo que pasó. */
    const POR_CODIGO = {
      131030: 'El número de quien escribió NO está en la lista de destinatarios de prueba, en WhatsApp → Configuración de la API → «Para».',
      131026: 'Meta no pudo entregar el mensaje. Suele ser un número mal formado o una cuenta sin WhatsApp.',
      131047: 'Pasaron más de 24 horas desde el último mensaje de esa persona: fuera de esa ventana solo se puede escribir con una plantilla aprobada.',
      131051: 'Ese tipo de mensaje no está permitido para este número.',
      190:    'El token de acceso venció o se regeneró. Genera uno nuevo en Meta y actualízalo en Cloudflare.',
      100:    'Meta dice que un dato de la petición es inválido. Lo más común: el formato del número de destino.',
      368:    'La cuenta está restringida temporalmente por políticas de Meta.',
      80007:  'Demasiados mensajes seguidos: Meta está frenando el envío.',
    };

    const QUE_SIGNIFICA = {
      sin_token: 'WHATSAPP_TOKEN no está puesta en el servidor.',
      meta_401:  'Meta rechazó el token: está vencido o se regeneró y no se actualizó en Cloudflare. Los temporales duran 24 horas.',
      meta_403:  'El token no tiene permiso sobre ese número.',
      meta_400:  'Meta rechazó la petición. Lo más común: el número de quien escribió NO está en la lista de destinatarios de prueba.',
      meta_404:  'Ese phone_number_id no existe o no es de esta app.',
      meta_429:  'Demasiados mensajes seguidos: Meta está frenando.',
    };
    const sb = servicio();
    if (sb) {
      const anotar = sb.bitacora({
        actor: null, empresa_id: marca?.id || null,
        accion: 'whatsapp.no_se_pudo_responder',
        detalle: {
          razon: salioAsi.razon,
          codigo_meta: salioAsi.codigo || null,
          subcodigo: salioAsi.sub || null,
          nota: POR_CODIGO[salioAsi.codigo]
                || QUE_SIGNIFICA[salioAsi.razon]
                || 'Meta rechazó el envío con ' + salioAsi.razon + '.',
          cuando: new Date().toISOString(),
        },
      });
      if (context.waitUntil) context.waitUntil(anotar); else await anotar;
    }
  }

  // Guardar y avisar van DETRÁS de la respuesta, nunca delante: en una
  // urgencia, cada segundo de retraso es un segundo sin el 911.
  const detras = (async () => {
    const esUrgencia = salida.corte === 'urgencia';
    const conversacionId = await guardarConversacion({
      empresa: marca, sesion: clave.slice(0, 64), mensajes,
      urgencia: esUrgencia, motivo: salida.motivo, via: 'whatsapp:' + (salida.via || ''),
      sinDato: salida.anclaje === 'degradado',
    });
    if (esUrgencia) {
      await avisar({
        empresa: marca, tipo: 'urgencia', conversacionId,
        titulo: 'Posible urgencia por WhatsApp: ' + (salida.motivo || 'sin clasificar'),
        lineas: ['Entró a las <b>' + new Date().toLocaleString('es-MX') + '</b>.',
                 'La conversación está en el panel, cifrada.'],
      });
    }
  })();
  if (context.waitUntil) context.waitUntil(detras); else await detras;

  return json({ ok: true });
}
