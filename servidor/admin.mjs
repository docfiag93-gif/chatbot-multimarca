// ════════════════════════════════════════════════════════════════════════
//  Panel de administración  ·  /api/admin
//
//  Es la ÚNICA puerta del panel. El navegador nunca habla con Supabase
//  directo, por una razón concreta: los datos de las empresas están cifrados
//  y la llave vive aquí. Si el panel leyera la base por su cuenta, recibiría
//  bultos ilegibles.
//
//  Cómo se decide quién puede qué, en orden:
//    1. Se verifica el token CONTRA el servidor de autenticación. No se
//       decodifica el JWT aquí: un JWT sin verificar es un papelito que
//       cualquiera escribe.
//    2. Se lee el rol DE LA BASE, no del token. El rol en el token lo puede
//       traer manipulado quien sepa; el de la base no.
//    3. Todas las consultas viajan con el token de la persona, así que RLS
//       vuelve a decidir. Si esta función tuviera un error de lógica, la base
//       sigue negando lo que no le toca. Dos cerraduras, no una.
// ════════════════════════════════════════════════════════════════════════

import { env } from '../publico/cerebro/entorno.mjs';
import { clienteSupabase, usuarioDelToken } from '../publico/cerebro/supabase.mjs';
import { cifrar, descifrar } from '../publico/cerebro/cifrado.mjs';

const URL_SB   = env('SUPABASE_URL');
const ANON     = env('SUPABASE_ANON_KEY');
const MAESTRA  = env('CHATBOT_CLAVE');

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Los campos que se guardan cifrados y su nombre en claro hacia el panel.
const SECRETOS = {
  persona:      'persona_cifrada',
  conocimiento: 'conocimiento_cifrado',
  limites:      'limites_cifrados',
  llaves:       'llaves_cifradas',
  // A dónde te llegan a TI los avisos. Va cifrado porque es tu número
  // personal y a qué hora localizarte: dato personal, no dato del negocio.
  destinos:     'destinos_cifrados',
};

export async function manejar(req, context) {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!URL_SB || !ANON)  return json({ error: 'Falta SUPABASE_URL o SUPABASE_ANON_KEY en las variables del proyecto' }, 500);
  if (!MAESTRA)          return json({ error: 'Falta CHATBOT_CLAVE en las variables del proyecto' }, 500);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const cuenta = await usuarioDelToken(URL_SB, ANON, token);
  if (!cuenta) return json({ error: 'Sesión no válida. Vuelve a entrar.' }, 401);

  const sb = clienteSupabase({ url: URL_SB, llave: ANON, token });

  // El rol sale de la base, con RLS puesta. Un usuario 'pendiente' o
  // desactivado llega hasta aquí y no pasa de aquí.
  let yo;
  try {
    const filas = await sb.seleccionar('usuarios', 'id,empresa_id,rol,nombre,email,activo',
      `id=eq.${cuenta.id}&limit=1`);
    yo = filas?.[0];
  } catch (e) {
    return json({ error: 'No pude leer tu perfil: ' + e.message }, 500);
  }
  if (!yo) return json({ error: 'Tu cuenta no tiene perfil. Avísale al administrador.' }, 403);

  let cuerpo;
  try { cuerpo = await req.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }
  const { accion, datos = {} } = cuerpo || {};

  const esSuper  = yo.rol === 'superadmin' && yo.activo;
  const esDueno  = esSuper || (yo.rol === 'dueno' && yo.activo);
  const negar    = () => json({ error: 'No tienes permiso para eso.' }, 403);

  // Una cuenta recién registrada no ve nada hasta que alguien la asigne.
  // Se le contesta con claridad en vez de con un error seco: la persona no
  // hizo nada mal, solo le falta que la den de alta.
  if (accion !== 'sesion' && (!yo.activo || yo.rol === 'pendiente')) {
    return json({ error: 'Tu cuenta todavía no está activada. Pídele al administrador que te asigne a una empresa.' }, 403);
  }

  try {
    switch (accion) {

      // ── quién soy ─────────────────────────────────────────────────────
      case 'sesion':
        return json({ yo: { ...yo, esSuper, esDueno }, correo: cuenta.email });

      // ── empresas ──────────────────────────────────────────────────────
      case 'empresas.listar': {
        // Sin filtro: RLS ya decide. El superadmin ve todas, un dueño ve la
        // suya. No se filtra aquí a propósito — que mande la base.
        const filas = await sb.seleccionar('empresas',
          'id,slug,nombre,dominio,plan,activa,suspendida_at,marca,saludo,sugerencias,descargo,captura,contactos,created_at',
          'order=created_at.desc');
        return json({ empresas: filas });
      }

      case 'empresas.crear': {
        if (!esSuper) return negar();
        const slug = String(datos.slug || '').trim().toLowerCase();
        if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
          return json({ error: 'El identificador solo admite minúsculas, números y guiones (2 a 40).' }, 400);
        }
        const filas = await sb.insertar('empresas', [{
          slug,
          nombre:  String(datos.nombre || slug).slice(0, 120),
          dominio: datos.dominio === 'clinico' ? 'clinico' : 'comercial',
          plan:    ['prueba','basico','pro'].includes(datos.plan) ? datos.plan : 'prueba',
          marca:   datos.marca || {},
          saludo:  datos.saludo || '¡Hola! ¿En qué te ayudo?',
        }]);
        await sb.bitacora({ actor: yo.id, empresa_id: filas[0].id, accion: 'empresa.crear',
                            detalle: { slug } });
        return json({ empresa: filas[0] });
      }

      case 'empresas.detalle': {
        const filas = await sb.seleccionar('empresas', '*', `id=eq.${datos.id}&limit=1`);
        const e = filas?.[0];
        if (!e) return json({ error: 'No encontré esa empresa (o no es tuya).' }, 404);

        // Se descifra aquí, nunca en el navegador.
        const claro = {};
        for (const [nombre, col] of Object.entries(SECRETOS)) {
          try { claro[nombre] = await descifrar(MAESTRA, e.id, e[col]); }
          catch (err) { claro[nombre] = null; claro[nombre + '_error'] = err.message; }
          delete e[col];
        }
        return json({ empresa: e, secretos: claro });
      }

      case 'empresas.guardar': {
        if (!esDueno) return negar();
        const id = datos.id;
        const filas = await sb.seleccionar('empresas', 'id', `id=eq.${id}&limit=1`);
        if (!filas?.[0]) return json({ error: 'Esa empresa no existe o no es tuya.' }, 404);

        const cambios = {
          nombre:      datos.nombre,
          saludo:      datos.saludo,
          descargo:    datos.descargo,
          marca:       datos.marca,
          sugerencias: datos.sugerencias,
          captura:     datos.captura,
          contactos:   datos.contactos,
          updated_at:  new Date().toISOString(),
        };
        // El plan y el dominio solo los mueve el superadmin: son lo que se
        // cobra y lo que activa las banderas rojas. Un cliente no se cambia
        // solo de plan ni se quita las alertas de urgencia.
        if (esSuper) {
          if (datos.plan)    cambios.plan = datos.plan;
          if (datos.dominio) cambios.dominio = datos.dominio;
        }
        for (const [nombre, col] of Object.entries(SECRETOS)) {
          if (datos.secretos && nombre in datos.secretos) {
            cambios[col] = await cifrar(MAESTRA, id, datos.secretos[nombre]);
          }
        }
        for (const k of Object.keys(cambios)) if (cambios[k] === undefined) delete cambios[k];

        const guardada = await sb.actualizar('empresas', `id=eq.${id}`, cambios);
        await sb.bitacora({ actor: yo.id, empresa_id: id, accion: 'empresa.guardar',
                            detalle: { campos: Object.keys(cambios) } });
        return json({ empresa: guardada[0] });
      }

      case 'empresas.suspender': {
        if (!esSuper) return negar();
        const activa = !!datos.activa;
        const g = await sb.actualizar('empresas', `id=eq.${datos.id}`, {
          activa, suspendida_at: activa ? null : new Date().toISOString(),
        });
        await sb.bitacora({ actor: yo.id, empresa_id: datos.id,
                            accion: activa ? 'empresa.reactivar' : 'empresa.suspender', detalle: {} });
        return json({ empresa: g[0] });
      }

      // ── usuarios ──────────────────────────────────────────────────────
      case 'usuarios.listar': {
        const filas = await sb.seleccionar('usuarios',
          'id,empresa_id,rol,nombre,email,activo,created_at', 'order=created_at.desc');
        return json({ usuarios: filas });
      }

      case 'usuarios.asignar': {
        if (!esSuper) return negar();
        const rol = datos.rol;
        if (!['superadmin','dueno','staff','pendiente'].includes(rol)) {
          return json({ error: 'Rol desconocido.' }, 400);
        }
        // La base tiene una restricción que exige lo mismo, pero se valida
        // aquí también para poder dar un mensaje entendible en vez de un
        // error de Postgres en crudo.
        const sinEmpresa = ['superadmin','pendiente'].includes(rol);
        if (sinEmpresa && datos.empresa_id) {
          return json({ error: 'Un superadmin no puede pertenecer a una empresa.' }, 400);
        }
        if (!sinEmpresa && !datos.empresa_id) {
          return json({ error: 'Para ese rol hace falta elegir empresa.' }, 400);
        }
        const g = await sb.actualizar('usuarios', `id=eq.${datos.id}`, {
          rol, empresa_id: sinEmpresa ? null : datos.empresa_id, activo: !!datos.activo,
        });
        await sb.bitacora({ actor: yo.id, empresa_id: datos.empresa_id || null,
                            accion: 'usuario.asignar', detalle: { usuario: datos.id, rol } });
        return json({ usuario: g[0] });
      }

      // ── leads (descifrados) ───────────────────────────────────────────
      case 'leads.listar': {
        const filtro = datos.empresa_id ? `empresa_id=eq.${datos.empresa_id}&` : '';
        const filas = await sb.seleccionar('leads',
          'id,empresa_id,datos_cifrados,consintio,atendido,created_at',
          filtro + 'order=created_at.desc&limit=100');

        const leidos = [];
        for (const f of filas) {
          let datosClaros = null, error = null;
          try { datosClaros = await descifrar(MAESTRA, f.empresa_id, f.datos_cifrados); }
          catch (e) { error = e.message; }
          leidos.push({ id: f.id, empresa_id: f.empresa_id, consintio: f.consintio,
                        atendido: f.atendido, created_at: f.created_at, datos: datosClaros, error });
        }
        // Ver datos de contacto es justo lo que hay que poder auditar después.
        await sb.bitacora({ actor: yo.id, empresa_id: datos.empresa_id || null,
                            accion: 'leads.ver', detalle: { cuantos: leidos.length } });
        return json({ leads: leidos });
      }

      case 'leads.atendido': {
        const g = await sb.actualizar('leads', `id=eq.${datos.id}`, { atendido: !!datos.atendido });
        return json({ lead: g[0] });
      }

      // ── números para el tablero ───────────────────────────────────────
      case 'metricas': {
        const filtro = datos.empresa_id ? `&empresa_id=eq.${datos.empresa_id}` : '';
        const [conv, urg, lead] = await Promise.all([
          sb.seleccionar('conversaciones', 'id', `limit=1000${filtro}`),
          sb.seleccionar('conversaciones', 'id,motivo_urgencia,created_at', `urgencia=is.true&limit=200${filtro}`),
          sb.seleccionar('leads', 'id,atendido', `limit=1000${filtro}`),
        ]);
        return json({
          conversaciones: conv.length,
          urgencias: urg.length,
          urgenciasRecientes: urg.slice(0, 10),
          leads: lead.length,
          leadsSinAtender: lead.filter(l => !l.atendido).length,
        });
      }

      case 'avisos.listar': {
        const filtro = datos.empresa_id ? `empresa_id=eq.${datos.empresa_id}&` : '';
        const filas = await sb.seleccionar('avisos',
          'id,empresa_id,tipo,canal,destino,estado,detalle,visto_at,created_at',
          filtro + 'order=created_at.desc&limit=60');
        return json({ avisos: filas });
      }

      case 'avisos.visto': {
        const g = await sb.actualizar('avisos', `id=eq.${datos.id}`,
          { visto_at: datos.visto ? new Date().toISOString() : null });
        return json({ aviso: g[0] });
      }

      case 'bitacora.listar': {
        const filas = await sb.seleccionar('bitacora',
          'id,actor,empresa_id,accion,detalle,created_at', 'order=created_at.desc&limit=100');
        return json({ bitacora: filas });
      }

      default:
        return json({ error: 'Acción desconocida: ' + accion }, 400);
    }
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 250) }, 500);
  }
}
