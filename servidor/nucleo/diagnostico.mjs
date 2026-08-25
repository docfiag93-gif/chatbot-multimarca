// ════════════════════════════════════════════════════════════════════════
//  Diagnóstico del entorno y errores accionables
//
//  Dos trabajos, y los dos existen por el mismo motivo: cuando algo falla,
//  la diferencia entre un producto y un experimento es si el mensaje dice
//  QUÉ hacer.
//
//   1. Revisar qué está configurado y qué falta, ANTES de que alguien
//      escriba en el chat y se lleve un "se me trabó la conexión".
//   2. Traducir fallos técnicos a mensajes que sirvan: uno para la persona
//      que está en el chat, otro para quien administra.
//
//  REGLA DURA: nada de lo que sale de aquí contiene un valor secreto. Se
//  reportan NOMBRES de variables y si están puestas o no. Nunca su contenido,
//  ni un fragmento, ni la longitud.
// ════════════════════════════════════════════════════════════════════════

import { CATALOGO, ORDEN_POR_OMISION } from './proveedores.mjs';

/**
 * Radiografía de la instalación. Devuelve algo seguro de mostrar en un panel
 * o de devolver por la API: solo booleanos y nombres.
 */
export function revisarEntorno(leerEntorno) {
  const hay = n => !!leerEntorno(n);

  const proveedores = Object.fromEntries(
    Object.entries(CATALOGO).map(([n, p]) => [n, hay(p.variable)]));
  const conProveedor = Object.values(proveedores).some(Boolean);

  // OJO: esto dice que la VARIABLE está puesta, no que la llave sirva. Son
  // cosas distintas y confundirlas costó una tarde: el panel decía
  // `base: true` mientras el bot no podía leer un solo negocio, porque la
  // variable traía la llave publicable en vez de la secreta. Con la
  // publicable, PostgREST no falla: contesta CERO FILAS, que es lo que ve
  // alguien sin permiso. Cero filas y "no existe" se ven igual desde aquí.
  //
  // Por eso existe `probarBase()` más abajo, y por eso el panel muestra
  // «configurada» y «responde» como dos cosas separadas.
  const base    = hay('SUPABASE_URL') && hay('SUPABASE_SERVICE_KEY');
  const panel   = hay('SUPABASE_URL') && hay('SUPABASE_ANON_KEY');
  const cifrado = hay('CHATBOT_CLAVE');
  const correo  = hay('RESEND_API_KEY');

  /* WhatsApp necesita TRES variables y cada una hace algo distinto:
       · WHATSAPP_VERIFY_TOKEN — la palabra secreta del apretón de manos.
         Sin ella, Meta no puede dar de alta el webhook: le contestamos 403.
       · WHATSAPP_TOKEN        — con qué se CONTESTA. Sin ella los mensajes
         entran y nadie puede responder.
       · WHATSAPP_APP_SECRET   — con qué se comprueba que quien llama es Meta
         de verdad. Sin ella, cualquiera con la URL puede escribirle al bot.
     Se miran por separado a propósito: «WhatsApp no sirve» no dice dónde
     buscar, y estas tres se ponen en lugares distintos del panel de Meta. */
  const wsVerifica = hay('WHATSAPP_VERIFY_TOKEN');
  const wsResponde = hay('WHATSAPP_TOKEN');
  const wsFirma    = hay('WHATSAPP_APP_SECRET');
  const wsPuestas  = [wsVerifica, wsResponde, wsFirma].filter(Boolean).length;
  const whatsapp   = wsPuestas === 3;

  const problemas = [];

  if (!conProveedor) {
    problemas.push({
      gravedad: 'critico',
      clave: 'sin_proveedor',
      titulo: 'El chat no puede responder',
      detalle: 'No hay ninguna llave de proveedor de IA configurada.',
      arreglo: 'Agrega al menos GEMINI_API_KEY o GROQ_API_KEY en las variables del proyecto y vuelve a desplegar.',
      variables: Object.entries(CATALOGO).map(([, p]) => p.variable),
    });
  }

  // Cifrado sin base, o base sin cifrado, es la combinación peligrosa: se
  // guardarían datos de personas sin poder cifrarlos.
  if (base && !cifrado) {
    problemas.push({
      gravedad: 'critico',
      clave: 'base_sin_cifrado',
      titulo: 'Hay base de datos pero no hay llave de cifrado',
      detalle: 'Las conversaciones y los datos de contacto se guardarían sin cifrar.',
      arreglo: 'Genera la llave en Herramientas → Generar llave y ponla como CHATBOT_CLAVE.',
      variables: ['CHATBOT_CLAVE'],
    });
  }

  if (!base) {
    problemas.push({
      gravedad: 'aviso',
      clave: 'sin_base',
      titulo: 'Sin base de datos',
      detalle: 'El chat funciona, pero no guarda conversaciones ni datos de contacto, y las marcas se leen del archivo en vez de la base.',
      arreglo: 'Configura SUPABASE_URL y SUPABASE_SERVICE_KEY.',
      variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
    });
  }

  if (!panel) {
    problemas.push({
      gravedad: 'aviso',
      clave: 'sin_panel',
      titulo: 'El panel no puede iniciar sesión',
      detalle: 'Falta la llave pública de Supabase que usa el acceso al panel.',
      arreglo: 'Configura SUPABASE_ANON_KEY.',
      variables: ['SUPABASE_ANON_KEY'],
    });
  }

  if (!correo) {
    problemas.push({
      gravedad: 'aviso',
      clave: 'sin_correo',
      titulo: 'Los avisos no van a salir',
      detalle: 'Las urgencias y las solicitudes de contacto se guardan, pero nadie recibe el correo.',
      arreglo: 'Configura RESEND_API_KEY.',
      variables: ['RESEND_API_KEY'],
    });
  }

  /* WhatsApp es OPCIONAL: la mayoría de los negocios solo usa el widget de
     su sitio, y a esos no hay que darles lata. Por eso NO se avisa cuando
     está sin configurar del todo.

     Lo que sí se avisa es el estado de EN MEDIO, que es el peligroso: con
     una o dos variables puestas, Meta cree que hay integración, llama al
     webhook, y falla de un modo que desde afuera parece que el bot está
     roto. Nadie configura dos de tres a propósito — es alguien a medio
     camino que se distrajo. */
  if (wsPuestas > 0 && wsPuestas < 3) {
    const faltan = [
      !wsVerifica && 'WHATSAPP_VERIFY_TOKEN',
      !wsResponde && 'WHATSAPP_TOKEN',
      !wsFirma    && 'WHATSAPP_APP_SECRET',
    ].filter(Boolean);

    const queSePierde = {
      WHATSAPP_VERIFY_TOKEN: 'Meta no va a poder dar de alta el webhook: le contestamos que no.',
      WHATSAPP_TOKEN:        'Los mensajes entran pero el bot no puede contestarlos.',
      WHATSAPP_APP_SECRET:   'No se comprueba que quien llama sea Meta: cualquiera con la URL puede escribirle al bot.',
    };

    problemas.push({
      gravedad: faltan.includes('WHATSAPP_APP_SECRET') && faltan.length === 1 ? 'critico' : 'aviso',
      clave: 'whatsapp_a_medias',
      titulo: 'WhatsApp está configurado a medias',
      detalle: faltan.map(v => `Falta ${v}. ${queSePierde[v]}`).join(' '),
      arreglo: 'Agrega ' + faltan.join(', ') + ' en las variables del proyecto y vuelve a desplegar. ' +
               'Las tres salen del panel de tu app en Meta.',
      variables: faltan,
    });
  }

  return {
    listo: !problemas.some(p => p.gravedad === 'critico'),
    proveedores,
    orden: leerEntorno('BOT_ORDEN') || ORDEN_POR_OMISION,
    capacidades: { base, panel, cifrado, correo, whatsapp },
    // Por separado, para que el panel pueda decir cuál falta en vez de
    // «WhatsApp no está listo».
    whatsapp: { verifica: wsVerifica, responde: wsResponde, firma: wsFirma },
    problemas,
  };
}

/**
 * Traduce un fallo de la cadena de proveedores a dos mensajes distintos.
 *
 * Por qué dos: la persona en el chat necesita saber qué hacer AHORA
 * ("escríbenos por WhatsApp"), y no le sirve de nada leer "gemini 429". Quien
 * administra necesita exactamente lo contrario. Mezclar ambos produce un
 * mensaje que no le sirve a ninguno de los dos.
 */
export function explicarFallo(error, { hayContacto = false } = {}) {
  const codigo = error?.codigo || 'DESCONOCIDO';
  const intentos = Array.isArray(error?.intentos) ? error.intentos : [];

  const cierre = hayContacto
    ? 'Escríbenos directo y te atendemos ahí mismo.'
    : 'Vuelve a intentarlo en un momento, por favor.';

  if (codigo === 'SIN_PROVEEDORES') {
    return {
      // Lo que ve el visitante: nunca "falta configurar una API key". Eso le
      // dice a un desconocido que el sitio está a medio montar.
      publico: 'El asistente no está disponible por ahora. ' + cierre,
      // Lo que ve quien administra, en el panel y en el registro.
      admin: 'No hay ninguna llave de proveedor configurada, ni en la marca ni en la plataforma.',
      arreglo: 'Agrega GEMINI_API_KEY o GROQ_API_KEY en las variables del proyecto.',
      codigo,
      intentos,
    };
  }

  if (codigo === 'TODOS_FALLARON') {
    const agotados  = intentos.some(i => i.estado === 429);
    const vencidos  = intentos.some(i => i.estado === 408);
    const rechazados = intentos.some(i => [401, 403].includes(i.estado));

    let admin = 'Todos los proveedores fallaron.';
    let arreglo = 'Revisa el detalle de los intentos.';
    if (rechazados) {
      admin = 'Algún proveedor rechazó la llave (no autorizado).';
      arreglo = 'Revisa que la llave sea válida y esté completa; vuelve a guardarla.';
    } else if (agotados) {
      admin = 'Se agotó la cuota de los proveedores disponibles.';
      arreglo = 'Espera a que se reinicie la cuota o agrega otro proveedor a la cadena.';
    } else if (vencidos) {
      admin = 'Los proveedores no contestaron a tiempo.';
      arreglo = 'Suele ser pasajero. Si se repite, sube el límite de tiempo o cambia el orden.';
    }

    return {
      publico: 'Se me trabó la conexión. ' + cierre,
      admin, arreglo, codigo, intentos,
    };
  }

  return {
    publico: 'Algo falló de mi lado. ' + cierre,
    admin: 'Fallo no clasificado: ' + String(error?.message || error).slice(0, 140),
    arreglo: 'Revisa el registro del servidor.',
    codigo, intentos,
  };
}

/**
 * Le pregunta a la base de verdad, en vez de creerle a una variable.
 *
 * Devuelve `lee` (si contestó) y `filas` (cuántas vio). Un `lee: true` con
 * `filas: 0` teniendo negocios dados de alta es la firma de una llave
 * equivocada: la publicable entra, pero RLS no la deja ver nada, y desde
 * fuera se confunde con una base vacía.
 *
 * REGLA: nunca devuelve el error crudo — puede traer la llave dentro.
 */
export async function probarBase(cliente) {
  if (!cliente) return { lee: false, filas: 0, razon: 'sin_configurar' };
  try {
    const filas = await cliente.seleccionar('empresas', 'id', 'limit=5');
    return { lee: true, filas: (filas || []).length, razon: null };
  } catch (e) {
    const m = String(e?.message || '');
    const razon =
      /401|invalid.*api.*key|jwt/i.test(m) ? 'llave_rechazada' :
      /403|permission/i.test(m)            ? 'sin_permiso'     :
      /fetch|network|timeout/i.test(m)     ? 'sin_conexion'    : 'error';
    return { lee: false, filas: 0, razon };
  }
}
