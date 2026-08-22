// ════════════════════════════════════════════════════════════════════════
//  Enlaces salientes — el bot avisa a otros sistemas
//
//  POR QUÉ ESTA PIEZA IMPORTA MÁS DE LO QUE PARECE
//
//  Un chatbot que solo conversa es mercancía: cualquiera construye uno en
//  unas semanas. Lo que no es mercancía es un chatbot cuyas acciones
//  ATERRIZAN en un sistema que ya existe — una agenda real, un expediente,
//  un inventario, un CRM.
//
//  «Tu cita quedó el jueves» dicho por un bot vale poco si nadie la anotó.
//  Vale mucho si además apareció en el sistema donde el negocio de verdad
//  trabaja. Esa diferencia no está en el modelo de lenguaje: está en si
//  existe una salida como esta.
//
//  Cada negocio apunta este enlace a donde quiera. La plataforma no sabe ni
//  necesita saber qué hay del otro lado.
//
//  ── SEGURIDAD ─────────────────────────────────────────────────────────
//  Cada envío va FIRMADO con un secreto que solo conocen el negocio y esta
//  plataforma. Sin firma, cualquiera que descubra la URL podría inventar
//  citas en el sistema del cliente. La firma se calcula sobre el cuerpo
//  completo y el momento del envío, para que una petición copiada no se
//  pueda reenviar mañana.
//
//  El secreto NUNCA viaja en el mensaje: viaja la firma, que no se puede
//  revertir.
// ════════════════════════════════════════════════════════════════════════

const cripto = globalThis.crypto;

/** Ventana en la que una firma sigue siendo válida del otro lado. */
export const VENTANA_SEGUNDOS = 300;

/** Eventos que el bot puede anunciar. Cada negocio elige cuáles recibir. */
export const EVENTOS = {
  'contacto.nuevo':      'Alguien dejó sus datos',
  'cita.solicitada':     'Alguien pidió una cita',
  'cotizacion.pedida':   'Alguien pidió una cotización',
  'reserva.pedida':      'Alguien quiere apartar lugar',
  'urgencia.detectada':  'Una política marcó una urgencia',
  'conversacion.cerrada':'Terminó una conversación',
  'humano.requerido':    'La conversación necesita a una persona',
};

export function catalogoDeEventos() {
  return Object.entries(EVENTOS).map(([id, nombre]) => ({ id, nombre }));
}

/* ── firma ───────────────────────────────────────────────────────────── */

function aHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Firma HMAC-SHA256 sobre `momento.cuerpo`.
 *
 * Se incluye el momento DENTRO de lo firmado, no solo al lado: si fuera un
 * campo aparte, cualquiera podría capturar un envío válido y reenviarlo con
 * otra hora. Firmándolo junto, cambiar la hora invalida la firma.
 */
export async function firmar(secreto, cuerpoTexto, momento) {
  const llave = await cripto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const datos = new TextEncoder().encode(`${momento}.${cuerpoTexto}`);
  return aHex(await cripto.subtle.sign('HMAC', llave, datos));
}

/**
 * Verificación, para quien reciba el enlace del otro lado.
 *
 * Se exporta a propósito: el cliente que integre necesita poder comprobar la
 * firma, y darle el código evita que se invente una comprobación débil — o
 * que no compruebe nada, que es lo que suele pasar.
 */
export async function verificar(secreto, cuerpoTexto, momento, firmaRecibida, ahora = Date.now()) {
  const edad = Math.abs(ahora / 1000 - Number(momento));
  if (!Number.isFinite(edad) || edad > VENTANA_SEGUNDOS) {
    return { valida: false, motivo: 'fuera de la ventana de tiempo' };
  }
  const esperada = await firmar(secreto, cuerpoTexto, momento);

  // Comparación de tiempo constante: comparar con === filtra información
  // sobre en qué carácter falló, y con suficientes intentos eso se explota.
  if (esperada.length !== String(firmaRecibida).length) {
    return { valida: false, motivo: 'firma no coincide' };
  }
  let dif = 0;
  for (let i = 0; i < esperada.length; i++) {
    dif |= esperada.charCodeAt(i) ^ String(firmaRecibida).charCodeAt(i);
  }
  return dif === 0 ? { valida: true } : { valida: false, motivo: 'firma no coincide' };
}

/* ── envío ───────────────────────────────────────────────────────────── */

/**
 * Manda un evento al sistema del negocio.
 *
 * NUNCA lanza. Un enlace caído no puede tumbar la respuesta que la persona
 * está esperando en pantalla: primero se le contesta, y esto corre detrás.
 *
 * Reintenta una vez ante fallo pasajero. No más: si el sistema del cliente
 * está caído, insistir cinco veces solo retrasa lo inevitable y multiplica
 * los duplicados del otro lado.
 */
export async function enviarEvento({ enlace, evento, datos, empresaId, msLimite = 8000 }) {
  if (!enlace?.url || !enlace?.secreto) {
    return { ok: false, motivo: 'sin enlace configurado' };
  }
  if (Array.isArray(enlace.eventos) && enlace.eventos.length && !enlace.eventos.includes(evento)) {
    return { ok: false, motivo: 'evento no suscrito' };
  }

  const momento = Math.floor(Date.now() / 1000);
  const cuerpo = JSON.stringify({
    evento,
    empresa: empresaId,
    momento,
    // `datos` va tal cual lo arma quien dispara el evento. Aquí no se
    // interpreta: esta capa transporta, no entiende.
    datos,
  });

  let firma;
  try { firma = await firmar(enlace.secreto, cuerpo, momento); }
  catch (e) { return { ok: false, motivo: 'no se pudo firmar' }; }

  for (let intento = 0; intento <= 1; intento++) {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), msLimite);
    try {
      const r = await fetch(enlace.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-chatbot-evento': evento,
          'x-chatbot-momento': String(momento),
          'x-chatbot-firma': firma,
        },
        body: cuerpo,
        signal: corte.signal,
      });
      clearTimeout(reloj);

      if (r.ok) return { ok: true, estado: r.status, intentos: intento + 1 };

      // 4xx es del cliente: su URL o su lógica. Reintentar no lo arregla.
      if (r.status >= 400 && r.status < 500) {
        return { ok: false, estado: r.status, motivo: 'el sistema del negocio rechazó el aviso' };
      }
      if (intento === 1) {
        return { ok: false, estado: r.status, motivo: 'el sistema del negocio no respondió bien' };
      }
    } catch (e) {
      clearTimeout(reloj);
      if (intento === 1) {
        return { ok: false, motivo: e?.name === 'AbortError' ? 'no contestó a tiempo' : 'no se pudo conectar' };
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, motivo: 'agotados los intentos' };
}

/**
 * Genera un secreto para un enlace nuevo. Se muestra UNA vez y se guarda
 * cifrado: si se pudiera volver a leer en claro, dejaría de ser un secreto
 * compartido y pasaría a ser un dato más de la base.
 */
export function generarSecreto() {
  const b = cripto.getRandomValues(new Uint8Array(32));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * El ejemplo que se le entrega al cliente para verificar del otro lado.
 * Se da hecho a propósito: la mitad de las integraciones rotas del mundo son
 * webhooks que nadie verifica porque el proveedor no explicó cómo.
 */
export function ejemploDeVerificacion(url = 'https://tu-sistema.com/webhook') {
  return `// Del lado de tu sistema (${url})
import { verificar } from './enlaces.mjs';

export async function recibir(peticion) {
  const cuerpo  = await peticion.text();          // el texto CRUDO, sin parsear
  const momento = peticion.headers.get('x-chatbot-momento');
  const firma   = peticion.headers.get('x-chatbot-firma');

  const r = await verificar(MI_SECRETO, cuerpo, momento, firma);
  if (!r.valida) return new Response(r.motivo, { status: 401 });

  const evento = JSON.parse(cuerpo);
  // ...aquí ya puedes confiar en el contenido
  return new Response('ok');
}`;
}
