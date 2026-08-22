// ════════════════════════════════════════════════════════════════════════
//  Avisos — cómo se entera el médico
//
//  LA JERARQUÍA, Y NO ES NEGOCIABLE:
//
//    1º  El paciente en urgencia ya recibió su instrucción: llamar al 911.
//        Eso pasa ANTES que cualquier aviso, sin depender de red, de correo
//        ni de que alguien traiga el celular en la mano.
//
//    2º  El aviso al médico es para que SE ENTERE y dé seguimiento. No es
//        el plan de atención. Si el correo tarda, si no hay señal, si el
//        celular está en silencio: el paciente ya iba en camino a urgencias.
//
//  Quien invierta ese orden —"el bot me avisa y yo lo atiendo"— construyó
//  una trampa: un paciente esperando a un médico que no sabe que lo esperan.
//
//  ── CANALES ───────────────────────────────────────────────────────────
//  Hoy funciona el correo, y con él dos cosas más sin pedirle permiso a
//  nadie: un archivo .ics con alarma (el celular lo agenda y suena) y un
//  enlace de un clic a Google Calendar.
//
//  Por qué NO se usa la API de Google Calendar todavía: exige OAuth, un
//  proyecto en Google Cloud, pantalla de consentimiento y renovar tokens.
//  Se puede hacer después; el .ics logra lo mismo —una alarma en el
//  calendario del teléfono— y funciona hoy, también en iPhone.
//
//  WhatsApp y SMS quedan preparados en la configuración pero no salen: uno
//  necesita cuenta de Meta Business verificada, el otro es de paga.
// ════════════════════════════════════════════════════════════════════════

import { env } from './entorno.mjs';

const RESEND = 'https://api.resend.com/emails';

const esc = t => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/**
 * Forma de `destinos` (se guarda cifrado en empresas.destinos_cifrados):
 * {
 *   urgencias: { correo, telefono, etiqueta },
 *   consultorio: { correo, telefono, etiqueta },
 *   personal: { correo, telefono, etiqueta },
 *   ruteo: { urgencia:'urgencias', lead:'consultorio', resumen:'personal' }
 * }
 */
export function destinoDe(destinos, tipo) {
  const cual = destinos?.ruteo?.[tipo] || (tipo === 'urgencia' ? 'urgencias' : 'consultorio');
  return { nombre: cual, ...(destinos?.[cual] || {}) };
}

// Un teléfono nunca se registra completo en la bitácora. Sirve para saber a
// dónde se avisó, no para dejar una lista de números en otra tabla.
export function recortar(valor) {
  const s = String(valor || '');
  if (s.includes('@')) return s.replace(/^(.).*(@.*)$/, '$1***$2');
  return s.length > 4 ? '***' + s.slice(-4) : '***';
}

// ── Calendario ──────────────────────────────────────────────────────────

/**
 * Un evento .ics con ALARMA. Al abrirlo desde el correo, el teléfono ofrece
 * agregarlo y la alarma suena sola. Funciona en Android y en iPhone.
 *
 * La alarma va en -PT0M (al momento) porque el evento se agenda AHORA: la
 * gracia es que suene de inmediato, no que recuerde algo de mañana.
 */
export function crearICS({ titulo, descripcion, cuando = new Date(), minutos = 15 }) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fin = new Date(cuando.getTime() + minutos * 60000);
  // Las líneas largas se doblan y los saltos se escapan: si no, hay
  // calendarios que rechazan el archivo entero sin decir por qué.
  const limpio = t => String(t).replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chatbot multimarca//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + Date.now() + '@chatbot',
    'DTSTAMP:' + fmt(new Date()),
    'DTSTART:' + fmt(cuando),
    'DTEND:' + fmt(fin),
    'SUMMARY:' + limpio(titulo),
    'DESCRIPTION:' + limpio(descripcion),
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + limpio(titulo),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Enlace de un clic para agregarlo a Google Calendar desde el correo. */
export function enlaceGoogleCalendar({ titulo, descripcion, cuando = new Date(), minutos = 15 }) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fin = new Date(cuando.getTime() + minutos * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    details: descripcion,
    dates: `${fmt(cuando)}/${fmt(fin)}`,
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

// ── El correo ───────────────────────────────────────────────────────────

function plantilla({ tipo, empresa, titulo, lineas, enlaceCal, telefono }) {
  const color = tipo === 'urgencia' ? '#dc2626' : tipo === 'lead' ? '#0f766e' : '#64748b';
  const encabezado = tipo === 'urgencia'
    ? 'El chat detectó una posible urgencia'
    : tipo === 'lead' ? 'Alguien dejó sus datos' : 'Resumen';

  // En urgencia se dice explícitamente que el paciente YA fue mandado al 911.
  // Sin esa línea, el médico podría creer que él es el primer eslabón.
  const nota = tipo === 'urgencia'
    ? `<p style="margin:14px 0 0;padding:12px;background:#fef2f2;border-radius:9px;
         color:#991b1b;font-size:13px;line-height:1.5">
         <b>Al paciente ya se le indicó llamar al 911</b> en el momento, antes de
         este aviso. Esto es para que lo sepas y des seguimiento — no para que
         alguien esté esperándote.</p>` : '';

  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;
    font-family:system-ui,-apple-system,Segoe UI,sans-serif">
    <div style="max-width:540px;margin:24px auto;background:#fff;border-radius:16px;
                overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:${color};color:#fff;padding:16px 20px">
        <div style="font-size:13px;opacity:.9">${esc(empresa)}</div>
        <div style="font-size:18px;font-weight:800;margin-top:2px">${esc(encabezado)}</div>
      </div>
      <div style="padding:20px;color:#0f172a;font-size:15px;line-height:1.6">
        <p style="margin:0 0 10px;font-weight:700">${esc(titulo)}</p>
        ${lineas.map(l => `<p style="margin:0 0 4px">${l}</p>`).join('')}
        ${nota}
        ${enlaceCal ? `<p style="margin:18px 0 0">
          <a href="${enlaceCal}" style="display:inline-block;background:${color};color:#fff;
             text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600">
             Ponerlo en mi calendario</a></p>` : ''}
        ${telefono ? `<p style="margin:10px 0 0"><a href="tel:${esc(telefono)}"
           style="color:${color};font-weight:600">Llamar a ${esc(telefono)}</a></p>` : ''}
        <p style="margin:18px 0 0;font-size:12px;color:#64748b">
          Aviso automático del chat. Puede contener información de salud:
          trátalo como confidencial.</p>
      </div>
    </div></body></html>`;
}

/**
 * Manda el aviso. Devuelve { ok, canal, detalle } — NUNCA lanza: que falle un
 * aviso no puede tumbar la respuesta que el paciente está esperando en pantalla.
 */
export async function enviarAviso({ tipo, empresa, destinos, titulo, lineas = [], adjuntarICS = true }) {
  const key = env('RESEND_API_KEY');
  const remitente = env('ALERTA_FROM') || 'Chatbot <onboarding@resend.dev>';
  const destino = destinoDe(destinos, tipo);
  const correo = destino.correo || env('LEADS_TO') || env('ALERTA_TO');

  if (!key)    return { ok: false, canal: 'correo', detalle: 'falta RESEND_API_KEY' };
  if (!correo) return { ok: false, canal: 'correo', detalle: 'la empresa no tiene correo de aviso para ' + tipo };

  const descripcion = [titulo, ...lineas.map(l => String(l).replace(/<[^>]+>/g, ''))].join('\n');
  const enlaceCal = enlaceGoogleCalendar({ titulo, descripcion });

  const cuerpo = {
    from: remitente,
    to: [correo],
    // El asunto viaja en la notificación del celular, a la vista de quien
    // mire la pantalla. Por eso NUNCA lleva nombre, teléfono ni síntoma.
    subject: tipo === 'urgencia' ? '🔴 Revisa el chat ahora'
           : tipo === 'lead'     ? 'Nueva solicitud desde el chat'
                                 : 'Resumen del chat',
    html: plantilla({ tipo, empresa, titulo, lineas, enlaceCal, telefono: destino.telefono }),
  };

  if (adjuntarICS) {
    const ics = crearICS({ titulo, descripcion, minutos: tipo === 'urgencia' ? 15 : 30 });
    cuerpo.attachments = [{
      filename: 'aviso.ics',
      content: btoa(unescape(encodeURIComponent(ics))),   // Resend pide base64
    }];
  }

  try {
    const r = await fetch(RESEND, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, canal: 'correo', destino: recortar(correo), detalle: 'resend ' + r.status + ' ' + t.slice(0, 120) };
    }
    return { ok: true, canal: 'correo+calendario', destino: recortar(correo), detalle: destino.nombre };
  } catch (e) {
    return { ok: false, canal: 'correo', destino: recortar(correo), detalle: String(e.message || e).slice(0, 120) };
  }
}
