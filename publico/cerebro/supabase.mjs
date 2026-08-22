// ════════════════════════════════════════════════════════════════════════
//  Cliente mínimo de Supabase (PostgREST) — sin SDK, solo fetch
//
//  DOS LLAVES, DOS CAMINOS. Esta es LA decisión de seguridad del producto:
//
//   1. El PANEL usa el token de la persona que inició sesión. Sus consultas
//      pasan por RLS: la base decide qué puede ver. Si mañana me equivoco
//      escribiendo una consulta en el panel, la base sigue negando lo que no
//      le toca. El error se queda en error, no en fuga.
//
//   2. El WIDGET público usa la llave de servicio, que se salta RLS. Es
//      necesario —quien escribe en el chat no tiene cuenta— y por eso esa
//      llave vive SOLO en Netlify y solo la toca bot.mjs, que nunca recibe
//      una consulta libre desde afuera: solo hace las tres o cuatro
//      operaciones que tiene programadas.
//
//  Si algún día alguien tiene la tentación de usar la llave de servicio en el
//  panel "porque es más fácil", ahí se pierde el aislamiento entre empresas.
// ════════════════════════════════════════════════════════════════════════

export function clienteSupabase({ url, llave, token }) {
  if (!url || !llave) throw new Error('Falta SUPABASE_URL o la llave');
  const base = url.replace(/\/+$/, '') + '/rest/v1';

  async function pedir(ruta, opciones = {}) {
    const r = await fetch(base + ruta, {
      ...opciones,
      headers: {
        apikey: llave,
        // Si hay token de usuario, manda ESE: PostgREST evalúa RLS con él.
        // Sin token, manda la llave (servicio) y RLS no aplica.
        Authorization: 'Bearer ' + (token || llave),
        'content-type': 'application/json',
        ...(opciones.headers || {}),
      },
    });

    const texto = await r.text();
    if (!r.ok) {
      // El mensaje de PostgREST puede traer nombres de columnas y detalles del
      // esquema. Se recorta: es útil para depurar, no para publicarlo entero.
      throw new Error('supabase ' + r.status + ' ' + texto.slice(0, 200));
    }
    return texto ? JSON.parse(texto) : null;
  }

  return {
    // tabla('empresas').seleccionar('*', 'slug=eq.consultorio&limit=1')
    seleccionar: (tabla, columnas = '*', filtro = '') =>
      pedir(`/${tabla}?select=${encodeURIComponent(columnas)}${filtro ? '&' + filtro : ''}`),

    insertar: (tabla, filas) =>
      pedir(`/${tabla}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(filas),
      }),

    actualizar: (tabla, filtro, cambios) =>
      pedir(`/${tabla}?${filtro}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(cambios),
      }),

    // Registrar en bitácora nunca debe tumbar la operación principal: si el
    // registro falla, se pierde una línea de historial, no la acción.
    async bitacora(fila) {
      try { await pedir('/bitacora', { method: 'POST', body: JSON.stringify(fila) }); }
      catch (e) { /* silencio a propósito */ }
    },
  };
}

/**
 * Lee el usuario dueño de un token de Supabase.
 * Se pregunta al servidor de autenticación en vez de decodificar el JWT aquí:
 * decodificarlo sin verificar la firma es exactamente como se cuela alguien
 * con un token inventado.
 */
export async function usuarioDelToken(url, llaveAnon, token) {
  if (!token) return null;
  const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
    headers: { apikey: llaveAnon, Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}
