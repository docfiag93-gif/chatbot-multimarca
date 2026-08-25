// ════════════════════════════════════════════════════════════════════════
//  ¿CUÁNTO LE QUEDA AL TOKEN DE WHATSAPP?
//
//  El token que Meta da en su panel dura 24 horas y NO AVISA cuando se
//  vence. El bot simplemente deja de contestar. Todo lo demás se ve verde:
//  los mensajes siguen entrando, la IA sigue escribiendo, la conversación
//  se sigue guardando. Solo que a la persona no le llega nada.
//
//  Es la peor forma de fallar que tiene este producto: silenciosa, total, y
//  con toda la evidencia apuntando al lugar equivocado. Quien lo sufra va a
//  buscar el problema en su propio negocio.
//
//  Meta SÍ sabe cuándo vence y lo dice si se le pregunta. Nadie se lo
//  preguntaba.
// ════════════════════════════════════════════════════════════════════════

const GRAFO = 'https://graph.facebook.com/v21.0';

/**
 * Le pregunta a Meta cuánto le queda al token.
 *
 * `traer` se inyecta para poder probar esto sin llamar a Meta. La firma es
 * la de `fetch`.
 *
 * Devuelve SIEMPRE un objeto, nunca lanza: esto se llama desde el
 * diagnóstico, y un diagnóstico que truena es peor que no tenerlo.
 *
 *   { estado: 'vigente'|'por_vencer'|'vencido'|'permanente'|'desconocido',
 *     horas, vence, razon }
 */
export async function revisarToken({ token, appSecret, appId, traer = fetch,
                                     ahora = Date.now(), avisarBajo = 12 } = {}) {
  if (!token) return { estado: 'desconocido', razon: 'sin_token' };

  /* Meta pide un token de inspección aparte del inspeccionado. Lo normal es
     `appId|appSecret`.

     Sin el appId se cae a que el token se inspeccione A SÍ MISMO, y ahí está
     el problema que se descubrió en producción: un token MUERTO no puede
     inspeccionar nada, ni a sí mismo. O sea que el aviso funcionaba mientras
     el token vivía —avisó con horas de anticipación, hizo su trabajo— y
     enmudecía en el instante exacto en que se moría, que es cuando más falta
     hace.

     Con `WHATSAPP_APP_ID` puesto, la inspección sigue funcionando aunque el
     token ya no valga. Y el identificador de la app NO es un secreto: viene
     en la URL del panel de Meta, a la vista. */
  const inspector = (appId && appSecret) ? `${appId}|${appSecret}` : token;
  const seInspeccionaSolo = !(appId && appSecret);

  let d;
  try {
    const r = await traer(
      `${GRAFO}/debug_token?input_token=${encodeURIComponent(token)}` +
      `&access_token=${encodeURIComponent(inspector)}`);
    if (!r.ok) {
      /* Meta RECHAZÓ la consulta. Cuando el token se inspecciona a sí mismo,
         eso casi siempre significa que ya no vale: uno vigente sí puede.
         No se declara «vencido» —no se sabe con certeza y decirlo sería
         inventar— pero tampoco se calla, que era lo que hacía antes. */
      return {
        estado: 'desconocido',
        razon: 'meta_' + r.status,
        sospechoso: seInspeccionaSolo && r.status >= 400 && r.status < 500,
      };
    }
    d = (await r.json())?.data;
  } catch (e) {
    // Sin red, o Meta caída. NO se reporta como vencido: decirle a alguien
    // que su token murió cuando solo falló la consulta lo manda a rotar una
    // credencial que servía.
    return { estado: 'desconocido', razon: 'sin_respuesta' };
  }

  if (!d) return { estado: 'desconocido', razon: 'respuesta_rara' };
  if (d.is_valid === false) return { estado: 'vencido', razon: d.error?.message ? 'meta_lo_dice' : 'invalido' };

  // `expires_at: 0` es como Meta dice «no vence». Es el que se quiere tener.
  const vence = Number(d.expires_at) || 0;
  if (!vence) return { estado: 'permanente' };

  const horas = (vence * 1000 - ahora) / 3_600_000;
  if (horas <= 0) return { estado: 'vencido', horas: 0, vence };

  return {
    estado: horas <= avisarBajo ? 'por_vencer' : 'vigente',
    horas: Math.round(horas * 10) / 10,
    vence,
  };
}

/** Lo que hay que hacer, dicho para quien no es programador. */
export function queHacerConElToken(salud) {
  switch (salud?.estado) {
    case 'permanente':
      return null;                       // nada que decir: es lo que se quiere
    case 'vencido':
      return {
        gravedad: 'critico',
        titulo: 'El token de WhatsApp ya venció',
        detalle: 'Tu bot NO puede contestar por WhatsApp. Los mensajes entran y ' +
                 'la respuesta se escribe, pero no sale.',
        arreglo: 'Genera uno nuevo en Meta → WhatsApp → Configuración de la API, ' +
                 'y actualiza WHATSAPP_TOKEN en Cloudflare.',
      };
    case 'por_vencer':
      return {
        gravedad: 'aviso',
        titulo: 'A tu token de WhatsApp le quedan ' +
                (salud.horas < 1 ? 'menos de 1 hora' : Math.floor(salud.horas) + ' horas'),
        detalle: 'Cuando venza, el bot deja de contestar por WhatsApp sin avisar ' +
                 'y todo lo demás se seguirá viendo bien.',
        arreglo: 'Los tokens del panel de Meta duran 24 horas. Para que no se ' +
                 'caiga solo, saca uno permanente de «usuario del sistema».',
      };
    case 'desconocido':
      /* Silencio solo cuando el silencio es honesto: si falló la red o Meta
         no contestó, no hay nada que decir. Pero si Meta RECHAZÓ la consulta
         mientras el token se inspeccionaba a sí mismo, lo más probable es
         que ya no valga — y callarse eso deja al dueño con un bot mudo y una
         pantalla en verde, que es justo el fallo que este archivo existe
         para impedir. */
      if (!salud.sospechoso) return null;
      return {
        gravedad: 'aviso',
        titulo: 'No pude comprobar tu token de WhatsApp',
        detalle: 'Meta rechazó la consulta. Cuando pasa esto, casi siempre es porque ' +
                 'el token ya venció — y entonces el bot no puede contestar por WhatsApp ' +
                 'aunque todo lo demás se vea bien.',
        arreglo: 'Genera uno nuevo en Meta → WhatsApp → Configuración de la API y ' +
                 'actualiza WHATSAPP_TOKEN en Cloudflare. Para que este aviso pueda ser ' +
                 'exacto, agrega también WHATSAPP_APP_ID (está en la URL de tu app en ' +
                 'Meta; no es un secreto).',
      };
    default:
      return null;                       // vigente
  }
}
