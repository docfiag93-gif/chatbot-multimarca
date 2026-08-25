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
import { construirPrompt, respuestaInmediata, accionValida, decidirSinIA } from './nucleo/cerebro.mjs';
import { preguntar } from './nucleo/proveedores.mjs';
import { revisarEntorno, explicarFallo, probarBase } from './nucleo/diagnostico.mjs';
import { revisarAnclaje, pulir, respuestaSinDato, admiteNoSaber }
  from './nucleo/anclaje.mjs';
import { enviarEvento } from './nucleo/enlaces.mjs';
import { servicio } from './nucleo/datos.mjs';
import { resolverMarca, configPublica, guardarConversacion, guardarLead, avisar, recogerHumanos,
         huecosOcupados, apartarCita, esSuPropioBot, apuntarMensaje, vecesQueNoSupo }
  from './nucleo/datos.mjs';
import { huecosLibres, tresOpciones, cualEligio } from './nucleo/agenda.mjs';
import { decidirEscalar } from './nucleo/escalar.mjs';

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

  /* ── ¿me escribió una persona? ──────────────────────────────────────
     El widget pregunta esto cada pocos segundos mientras el chat está
     abierto. Es deliberadamente barato: en la base hay un booleano
     indexado, así que el caso normal —no hay nada— no descifra nada.

     Se busca por la SESIÓN del navegador, nunca por el id de la
     conversación: el visitante conoce la suya y nada más. Aceptar un id
     sería regalar una llave para asomarse a charlas ajenas. */
  if (req.method === 'GET' && url.searchParams.get('humanos')) {
    const marca = await resolverMarca(url.searchParams.get('marca'));
    const sesion = url.searchParams.get('sesion') || '';
    if (!marca?.id || !sesion) return json({ mensajes: [] });
    return json({ mensajes: await recogerHumanos({ empresa: marca, sesion }) });
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
  let marca = await resolverMarca(marcaId);

  /* Un negocio suspendido contesta «fuera de servicio» a todo el mundo —
     incluido su dueño. Eso lo deja sin poder ver lo que acaba de configurar
     justo antes de soltarlo a sus clientes, que es cuando más falta hace
     mirarlo.

     Si viene una sesión de dueño, se le deja pasar y se le dice claramente
     que está viendo una vista previa. La comprobación solo corre cuando hay
     cabecera: un visitante anónimo no paga ni una consulta de más. */
  if (marca.suspendida) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const dueno = token && await esSuPropioBot({ token, empresaId: marca.id });

    if (!dueno) {
      return json({ texto: 'Este chat está fuera de servicio por el momento.',
                    sugerencias: [], accion: 'ninguna', via: 'suspendida' });
    }
    // Se vuelve a resolver sin el corte de suspensión, para trabajar con el
    // perfil completo y no con el esqueleto que trae `suspendida`.
    marca = { ...(await resolverMarca(marcaId, { incluirSuspendidas: true })), vistaPrevia: true };
  }

  const hayContacto = !!(marca.contactos && Object.keys(marca.contactos).length);

  /* ── EL INTERRUPTOR ────────────────────────────────────────────────────
     Tres estados, no dos, y el de en medio es el que importa.

     Apagar del todo deja a quien escribe sin nada: se va, y esa persona ya
     no vuelve. Pero dejar contestando a un bot que responde mal —en un
     consultorio— es peor que el silencio.

     `recados` es la salida honesta: el bot deja de hablar por su cuenta,
     dice la verdad («ahorita te contesta una persona») y se queda tomando
     el nombre y el teléfono. No se pierde a nadie y no se dice ninguna
     tontería. Es el botón que se aprieta a las 11 de la noche cuando algo
     salió raro, sin tener que despertar a nadie.

     Se comprueba AQUÍ, antes de llamar a la IA: apagar tiene que costar
     cero y surtir efecto en el siguiente mensaje, no en el siguiente
     despliegue. ─────────────────────────────────────────────────────── */
  const modo = marca.modo || 'activo';

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
  //
  // OJO CON EL ORDEN: esto va ANTES de atender el modo `recados`. Una
  // urgencia clínica se responde aunque el bot esté callado — el modo existe
  // para que no diga tonterías, no para que deje de mandar a alguien al 911.
  /* ── EL AGENTE ──────────────────────────────────────────────────────
     Aquí el bot deja de contestar y empieza a hacer.

     Si en el turno anterior le ofrecimos tres horarios y ahora eligió uno,
     se aparta AHORA, sin pasar por la IA. Preguntarle a un modelo «¿esto
     significa que quiere el jueves a las 5?» es meter una moneda al aire en
     el único punto donde no puede haber azar: el momento de escribir en la
     agenda de alguien.

     Se compara contra lo que SE OFRECIÓ, nunca contra el calendario entero:
     si pide una hora que no estaba entre las opciones, quizá se la ganaron
     mientras escribía. */
  const ofrecidas = Array.isArray(cuerpo.horarios) ? cuerpo.horarios : [];
  if (ofrecidas.length && marca.id) {
    const elegida = cualEligio(ultimo, ofrecidas);
    if (elegida) {
      const r = await apartarCita({
        empresa: marca, dia: elegida.dia, hora: elegida.hora, sesion,
        datos: { desde: 'chat' },
      });

      if (r.ok) {
        /* Avisar VA DETRÁS de la respuesta. Quien acaba de apartar su lugar
           no tiene que esperar a que salga un correo para saber que quedó.

           Y el aviso no lleva ni nombre ni teléfono: cuando se apartó todavía
           no los hay, y aunque los hubiera, un asunto de correo con el dato
           de una persona se queda visible en la pantalla de cualquiera que
           pase junto al celular. */
        enSegundoPlano(context, avisar({
          empresa: marca, tipo: 'cita',
          titulo: 'Alguien apartó ' + elegida.comoSeDice,
          lineas: [
            'Está <b>apartada</b>, no confirmada.',
            'Confírmala o cancélala desde la pestaña Agenda.',
          ],
        }));

        return json({
          texto: 'Listo, te aparté el ' + elegida.comoSeDice + '. ' +
                 'Todavía no es una cita confirmada: te contactan para confirmarla. ' +
                 '¿Me dejas tu nombre y teléfono?',
          sugerencias: [], accion: 'capturar_contacto', via: 'agenda', cita: elegida,
        });
      }
      // Alguien más lo tomó entre que se ofreció y se eligió. Se dice, y se
      // vuelve a ofrecer: dejarlo en «no se pudo» sería perder a la persona.
      if (r.razon === 'ya_tomado') {
        const otras = tresOpciones(huecosLibres({
          horarios: marca.horarios || {}, ocupados: await huecosOcupados(marca.id),
          duracion: marca.duracionCita || 30 }));
        return json({
          texto: 'Se me acaba de ocupar ese horario, alguien lo tomó hace un momento. ' +
                 (otras.length ? '¿Te sirve alguno de estos?' : 'Déjame tus datos y te buscamos.'),
          sugerencias: otras.map(o => o.comoSeDice),
          accion: otras.length ? 'ninguna' : 'capturar_contacto',
          via: 'agenda', horarios: otras,
        });
      }
    }
  }

  let corte = decidirSinIA({ marca, modo, ultimo, hayContacto });
  const inmediata = corte?.corte === 'urgencia' ? corte : null;

  /* ── El tope del día ───────────────────────────────────────────────────
     Se cuenta AQUÍ, y no arriba, por dos razones que se ven al revés:

     · Solo se cobra lo que de verdad iba a llegar a la IA. Si ya hubo corte
       —urgencia, apagado, recados— no se gastó cuota y sería injusto sumarla:
       el dueño que apaga su bot para no decir tonterías acabaría pagando por
       apagarlo.

     · Y sobre todo: contar exige un viaje a la base. Ponerlo antes obligaría
       a que un «me duele el pecho» esperara ese viaje para recibir su
       respuesta. La urgencia sale primero, sin preguntarle a nadie.

     Si la base no contesta, `apuntarMensaje` devuelve null y el mensaje PASA.
     Quedarse sin contador es un problema nuestro; cobrárselo a quien está
     escribiendo sería cobrarle el fallo a la persona equivocada. */
  let cuota = null;
  if (!corte) {
    cuota = await apuntarMensaje({ empresa: marca });
    if (cuota?.excedido) {
      // Se vuelve a preguntar entero en vez de armar la respuesta a mano:
      // así el orden —urgencia primero, siempre— sigue viviendo en un solo
      // lugar, aunque alguien mueva este bloque algún día.
      corte = decidirSinIA({ marca, modo, ultimo, hayContacto, sobreTope: true });
    }

    // Avisarle al dueño, una sola vez por umbral. Que se quede sin cuota sin
    // enterarse es lo peor de los dos mundos: pierde clientes y cree que el
    // bot funciona.
    if (cuota?.avisarCerca || cuota?.avisarTope) {
      enSegundoPlano(context, avisar({
        empresa: marca, tipo: 'tope',
        titulo: cuota.avisarTope
          ? 'Tu bot llegó al tope de hoy'
          : 'Tu bot va en el 80% de los mensajes de hoy',
        lineas: cuota.avisarTope
          ? ['Llevas <b>' + cuota.usados + '</b> de <b>' + cuota.tope + '</b> mensajes.',
             'A partir de ahora toma datos de contacto en vez de contestar, y vuelve solo mañana.',
             'Si esto pasa seguido, el plan se te quedó chico.']
          : ['Llevas <b>' + cuota.usados + '</b> de <b>' + cuota.tope + '</b> mensajes.',
             'Te avisamos antes de llegar para que no te agarre desprevenido.'],
      }));
    }
  }

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

  // El bot callado: `decidirSinIA` ya resolvió el orden, incluido el caso
  // de que una urgencia gane sobre el interruptor.
  if (corte) { const { corte: _q, ...r } = corte; return json(r); }

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
    // Se pule ANTES de anclar: recortar puede quitar la frase que traía un
    // precio inventado, y entonces ya no hay nada que degradar.
    const pulido = pulir(String(datos.texto || '').slice(0, 1200));
    const texto = pulido.texto;
    const anclaje = revisarAnclaje(marca, texto);

    let salida;
    if (!anclaje.anclado) {
      const seguro = respuestaSinDato(marca, anclaje.inventadas);
      salida = { ...seguro, via, anclaje: 'degradado' };

      /* ── Dejar de insistir ────────────────────────────────────────────
         El bot acaba de admitir que no tiene el dato. Si ya lo había hecho
         antes en esta misma conversación, seguir contestando lo mismo no es
         prudencia: es gastarle el tiempo a alguien que ya entendió que aquí
         no va a encontrar lo que busca. La tercera vez no vuelve a
         preguntar — se va.

         Se consulta la base SOLO en este punto, cuando el turno de ahora ya
         falló. Las conversaciones que van bien no pagan ese viaje. */
      const fallos = await vecesQueNoSupo({ empresaId: marca.id, sesion });
      const paso = decidirEscalar({ marca, fallosPrevios: fallos });
      if (paso) {
        const { corte: _c, tras, ...r } = paso;
        salida = { ...r, via, anclaje: 'degradado', escalado: tras };
      }
    } else if (admiteNoSaber(texto)) {
      /* La IA contestó bien —no inventó nada, así que el anclaje la dejó
         pasar— pero lo que dijo fue «no tengo esa información».

         Para quien escribe eso es idéntico a que el anclaje la degradara:
         preguntó y no le contestaron. Antes solo se contaba el caso de la
         invención, y por eso la lista de «lo que le falta al negocio» venía
         corta y el escalamiento tardaba de más en ofrecer una persona. */
      salida = {
        texto,
        sugerencias: Array.isArray(datos.sugerencias) ? datos.sugerencias.slice(0, 3).map(String) : [],
        accion: accionValida(marca, datos.accion),
        via,
        anclaje: 'sin_dato',
      };
      if (pulido.arreglos.length) salida.pulido = pulido.arreglos;

      const fallos = await vecesQueNoSupo({ empresaId: marca.id, sesion });
      const paso = decidirEscalar({ marca, fallosPrevios: fallos });
      if (paso) {
        const { corte: _c, tras, ...r } = paso;
        salida = { ...r, via, anclaje: 'sin_dato', escalado: tras };
      }
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
      // Se deja constancia de lo que hubo que arreglar. Antes esto decía
      // «floja» y nadie lo leía; ahora nombra QUÉ se corrigió, que es lo
      // único que sirve para ajustar el tono del negocio.
      if (pulido.arreglos.length) salida.pulido = pulido.arreglos;

      /* Que el modelo pida «agendar» ya no abre un formulario a ciegas:
         mira la agenda y ofrece TRES horas que de verdad están libres.
         Esa es toda la diferencia entre «sí hacemos citas» y «¿te sirve el
         jueves a las 5?». */
      if (salida.accion === 'agendar' && marca.id && Object.keys(marca.horarios || {}).length) {
        /* La duración la pone el negocio: una consulta de 40 minutos con
           huecos de 30 ofrece horas que se empalman, y eso lo descubre el
           dueño cuando ya tiene dos personas a la misma hora. */
        const opciones = tresOpciones(huecosLibres({
          horarios: marca.horarios, ocupados: await huecosOcupados(marca.id),
          duracion: marca.duracionCita || 30 }));
        if (opciones.length) {
          salida.sugerencias = opciones.map(o => o.comoSeDice);
          salida.horarios = opciones;      // el widget las devuelve al elegir
          salida.accion = 'ninguna';       // primero elige, luego los datos
        }
      }
    }

    // Cuando hubo un fallo antes de acertar, se deja constancia: es la señal
    // temprana de que un proveedor se está degradando.
    if (intentos.length) salida.reintentos = intentos.length;

    if (marca.vistaPrevia) salida.vistaPrevia = true;

    enSegundoPlano(context, guardarConversacion({
      empresa: marca, sesion,
      mensajes: [...mensajes, { rol: 'bot', texto: salida.texto }],
      urgencia: false, via: origen === 'marca' ? via + ':marca' : via,
      // El anclaje calculaba esto y lo tiraba. Cada vez que el bot tiene que
      // admitir que no sabe algo, alguien preguntó algo que el negocio no ha
      // cargado: es la lista de tareas más útil que existe.
      // Las DOS formas de no saber: la que hubo que degradar por inventar,
      // y la que el modelo admitió solo. Desde fuera son la misma cosa.
      sinDato: salida.anclaje === 'degradado' || salida.anclaje === 'sin_dato',
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
