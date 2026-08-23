// ════════════════════════════════════════════════════════════════════════
//  Chatbot — el mensajero  ·  /api/bot
//
//  Corre sobre Cloudflare Pages. El envoltorio de la plataforma vive en
//  functions/api/ y es de diez líneas: mudarse a otra es cambiar el enchufe.
//
//  Este archivo hace cuatro cosas y ninguna más: recibir, verificar,
//  preguntar y devolver. Quién contesta y qué pasa si falla es problema de
//  cerebro/proveedores.mjs. Qué se le pregunta, de cerebro/cerebro.mjs.
//  Quién es la marca, de cerebro/datos.mjs.
//
//  Esa separación no es estética: permitió probar la cadena de proveedores
//  con un fetch simulado, sin desplegar y sin gastar una sola llamada real.
// ════════════════════════════════════════════════════════════════════════

import { env } from './nucleo/entorno.mjs';
import { MARCAS } from './nucleo/marcas.mjs';
import { construirPrompt, respuestaInmediata, accionValida } from './nucleo/cerebro.mjs';
import { preguntar } from './nucleo/proveedores.mjs';
import { revisarEntorno, explicarFallo, probarBase } from './nucleo/diagnostico.mjs';
import { revisarAnclaje, revisarRedaccion, limpiarMuletillas, respuestaSinDato }
  from './nucleo/anclaje.mjs';
import { enviarEvento } from './nucleo/enlaces.mjs';
import { servicio } from './nucleo/datos.mjs';
import { resolverMarca, configPublica, guardarConversacion, guardarLead, avisar }
  from './nucleo/datos.mjs';

// ── Freno de mano ───────────────────────────────────────────────────────
// Este endpoint es público y anónimo: cualquiera con la URL puede quemar la
// cuota gratuita en una tarde. 30 mensajes cada 10 minutos por dirección
// alcanza de sobra para una conversación real y no para un script.
const _limites = new Map();
function permitir(req) {
  const ip = (req.headers.get('cf-connecting-ip') ||
              req.headers.get('x-nf-client-connection-ip') ||
              req.headers.get('x-forwarded-for') || 'anon').split(',')[0].trim();
  const ahora = Date.now(), ventana = 10 * 60 * 1000, max = 30;
  const prev = _limites.get(ip);
  const item = (!prev || ahora - prev.inicio > ventana) ? { inicio: ahora, n: 0 } : prev;
  item.n++; _limites.set(ip, item);
  if (_limites.size > 2000) for (const [k, v] of _limites) if (ahora - v.inicio > ventana) _limites.delete(k);
  return item.n <= max;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/**
 * Deja una tarea corriendo DESPUÉS de haber respondido.
 *
 * Por qué importa: guardar la conversación y mandar el correo tardan entre
 * medio segundo y dos. Si se esperan, quien está en una urgencia ve su
 * instrucción de llamar al 911 dos segundos más tarde. Con waitUntil, la
 * plataforma mantiene viva la función mientras la tarea termina, pero la
 * respuesta ya salió. Si el entorno no lo trae, se espera: mejor lento que
 * perder el aviso.
 */
function enSegundoPlano(context, promesa) {
  const p = Promise.resolve(promesa).catch(() => {});
  if (typeof context?.waitUntil === 'function') { context.waitUntil(p); return null; }
  return p;
}

export async function manejar(req, context) {
  const url = new URL(req.url);

  // ── Salud: qué está configurado, sin revelar ningún valor ────────────
  if (req.method === 'GET' && url.searchParams.get('ping')) {
    const d = revisarEntorno(env);

    // No basta con que la variable esté puesta: hay que preguntarle a la
    // base. Una llave equivocada no da error, da CERO FILAS — y eso se ve
    // igual que una base vacía. Distinguirlo aquí evita perder una tarde
    // buscando el problema en el lado equivocado.
    const prueba = d.capacidades.base ? await probarBase(servicio()) : null;
    const problemas = [...d.problemas];

    if (prueba && !prueba.lee) {
      problemas.unshift({
        gravedad: 'critico',
        clave: 'base_no_responde',
        titulo: 'La base no contesta',
        detalle: {
          llave_rechazada: 'La llave de servicio no fue aceptada.',
          sin_permiso: 'La llave entró pero no tiene permiso de leer.',
          sin_conexion: 'No hubo conexión con la base.',
        }[prueba.razon] || 'La consulta falló.',
        arreglo: 'Revisa SUPABASE_SERVICE_KEY: va la llave SECRETA, no la publicable. Después vuelve a desplegar.',
        variables: ['SUPABASE_SERVICE_KEY'],
      });
    } else if (prueba && prueba.lee && prueba.filas === 0) {
      problemas.unshift({
        gravedad: 'aviso',
        clave: 'base_vacia_o_sin_permiso',
        titulo: 'La base contesta pero no se ve ningún negocio',
        detalle: 'O todavía no hay negocios dados de alta, o la llave puesta ' +
                 'es la PUBLICABLE en vez de la secreta: con esa, la base ' +
                 'contesta sin error pero devuelve cero filas.',
        arreglo: 'Si ya diste de alta un negocio, cambia SUPABASE_SERVICE_KEY por la llave secreta y vuelve a desplegar.',
        variables: ['SUPABASE_SERVICE_KEY'],
      });
    }

    return json({
      ok: true,
      listo: d.listo && !(prueba && !prueba.lee),
      marcasArchivo: Object.keys(MARCAS),
      proveedores: d.proveedores,
      orden: d.orden,
      capacidades: {
        ...d.capacidades,
        // «configurada» y «responde» son cosas distintas.
        baseResponde: prueba ? prueba.lee : false,
        negociosVisibles: prueba ? prueba.filas : 0,
      },
      problemas,
    });
  }

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

  const hayContacto = !!(marca.contactos && Object.keys(marca.contactos).length);

  // ── Rama 1: formulario de contacto ───────────────────────────────────
  if (tipo === 'lead') {
    if (!lead?.nombre || !lead?.telefono) return json({ error: 'Falta nombre o teléfono' }, 400);
    if (!lead.consiente) return json({ error: 'Falta aceptar el aviso de privacidad' }, 400);

    try {
      await guardarLead({ empresa: marca, lead });
    } catch (e) {
      // Si no se pudo guardar, la persona NO se queda colgada: se le dice y
      // se le ofrece el contacto directo. Perder su intención es lo caro.
      return json({ ok: false,
        error: 'No pude registrar tu solicitud. Escríbenos directo, por favor.' }, 502);
    }

    // El aviso por correo es para que TÚ te enteres. El enlace saliente es
    // para que el SISTEMA del negocio se entere: su agenda, su expediente, su
    // CRM. Un bot que solo avisa por correo obliga a alguien a recapturar
    // todo a mano, y ahí se pierde la mitad.
    enSegundoPlano(context, enviarEvento({
      enlace: marca.enlace,
      evento: 'contacto.nuevo',
      empresaId: marca.id,
      datos: {
        nombre: lead.nombre, telefono: lead.telefono, motivo: lead.motivo || '',
        origen: 'chat', sesion: String(sesion || '').slice(0, 64),
      },
    }));

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

  // ── Rama 2: conversación ─────────────────────────────────────────────
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
    // conversación y avisar queda corriendo detrás, sin retrasarla.
    enSegundoPlano(context, (async () => {
      const conversacionId = await guardarConversacion({
        empresa: marca, sesion, mensajes,
        urgencia: true, motivo: inmediata.motivo, via: 'filtro-local',
      });
      await enviarEvento({
        enlace: marca.enlace, evento: 'urgencia.detectada', empresaId: marca.id,
        datos: { motivo: inmediata.motivo, politica: inmediata.politica,
                 sesion: String(sesion || '').slice(0, 64) },
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
    const { datos, via, origen, intentos } = await preguntar({
      marca,
      prompt: construirPrompt(marca, mensajes),
      leerEntorno: env,
      opciones: {
        modelo:   env('CLAUDE_MODELO'),
        esfuerzo: env('CLAUDE_ESFUERZO') || 'high',
      },
    });

    // ── ANCLAJE ────────────────────────────────────────────────────────
    // Pedirle en el prompt que no invente es una petición, no una garantía.
    // Aquí se comprueba: cada precio, hora, día o teléfono de la respuesta
    // tiene que existir en lo que el negocio cargó. Si no está, se degrada
    // a una respuesta que admite el hueco.
    //
    // Es la diferencia entre un bot que suena bien y uno en el que se puede
    // confiar: inventar un horario manda a alguien a una cortina cerrada.
    let texto = limpiarMuletillas(String(datos.texto || '')).slice(0, 1200);
    const anclaje = revisarAnclaje(marca, texto);
    const redaccion = revisarRedaccion(texto);

    let salida;
    if (!anclaje.anclado) {
      const seguro = respuestaSinDato(marca, anclaje.inventadas);
      salida = { ...seguro, via, anclaje: 'degradado' };
    } else {
      salida = {
        texto,
        sugerencias: Array.isArray(datos.sugerencias) ? datos.sugerencias.slice(0, 3).map(String) : [],
        // Que el modelo pida una acción no significa que el negocio la tenga
        // encendida. Se filtra contra su configuración: una tienda sin
        // "agendar" nunca va a abrir un formulario de citas por un desliz
        // del modelo.
        accion: accionValida(marca, datos.accion),
        via,
      };
      if (redaccion.largo || redaccion.muchasPreguntas) salida.redaccion = 'floja';
    }

    // Cuando hubo un fallo antes de acertar, se deja constancia: es la señal
    // temprana de que un proveedor se está degradando.
    if (intentos.length) salida.reintentos = intentos.length;

    enSegundoPlano(context, guardarConversacion({
      empresa: marca, sesion,
      mensajes: [...mensajes, { rol: 'bot', texto: salida.texto }],
      urgencia: false, via: origen === 'marca' ? via + ':marca' : via,
    }));

    return json(salida);
  } catch (e) {
    // Dos mensajes distintos a propósito: el visitante recibe qué hacer
    // ahora, y el detalle técnico se queda del lado del servidor. Decirle a
    // un desconocido "falta configurar una API key" le informa que el sitio
    // está a medio montar.
    const f = explicarFallo(e, { hayContacto });
    return json({
      texto: f.publico,
      sugerencias: [],
      accion: 'derivar_humano',
      via: 'error',
      codigo: f.codigo,
    });
  }
}
