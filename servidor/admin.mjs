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

import { env } from './nucleo/entorno.mjs';
import { clienteSupabase, usuarioDelToken } from './nucleo/supabase.mjs';
import { cifrar, descifrar } from '../publico/cerebro/cifrado.mjs';
import { normalizarPerfil, revisarPerfil, aSlug, IDIOMAS, TIPOS_OFERTA }
  from '../publico/cerebro/perfil.mjs';
import { CATEGORIAS_SUGERIDAS } from '../publico/cerebro/catalogos-ui.mjs';
import { catalogoDePoliticas } from './nucleo/politicas.mjs';
import { catalogoDeAcciones } from './nucleo/acciones.mjs';
import { preguntar } from './nucleo/proveedores.mjs';
import { SEMILLAS } from '../publico/cerebro/semillas.mjs';

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
  // Catálogo, horarios, ubicaciones, objetivos y atributos propios. Cifrado
  // porque ahí van precios, márgenes y detalles de operación del cliente.
  perfil:       'perfil_cifrado',
  // URL + secreto del sistema al que el bot le avisa. Cifrado: el secreto es
  // lo que impide que cualquiera invente citas en el sistema del cliente.
  enlace:       'enlace_cifrado',
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
  // Excepción a propósito: una cuenta sin activar SÍ puede escribir al buzón
  // y leer sus propios hilos. Es justo quien más necesita reportar algo —
  // «llevo tres días esperando que me activen» — y dejarla fuera del único
  // canal de soporte convierte un trámite lento en un callejón sin salida.
  const ABIERTAS_A_PENDIENTES = ['sesion', 'reportes.crear', 'reportes.mios', 'reportes.responder'];

  if (!ABIERTAS_A_PENDIENTES.includes(accion) && (!yo.activo || yo.rol === 'pendiente')) {
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
          'id,slug,nombre,categoria,plan,activa,estado,modo,whatsapp_id,ejemplo,suspendida_at,marca,saludo,sugerencias,descargo,captura,contactos,politicas,acciones,created_at',
          'order=created_at.desc');
        return json({ empresas: filas });
      }

      // Lo que el asistente de alta necesita saber: categorías sugeridas,
      // políticas disponibles y acciones. Se sirve desde el servidor para que
      // agregar una política nueva la haga aparecer sola en el panel.
      case 'catalogos':
        return json({
          categorias: CATEGORIAS_SUGERIDAS,
          idiomas: IDIOMAS,
          tiposOferta: TIPOS_OFERTA,
          politicas: catalogoDePoliticas(),
          acciones: catalogoDeAcciones(),
          semillas: Object.entries(SEMILLAS).map(([slug, s]) => ({
            slug, nombre: s.nombre, categoria: s.categoria })),
        });

      case 'empresas.crear': {
        if (!esSuper) return negar();
        const slug = aSlug(datos.slug || datos.nombre);
        if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
          return json({ error: 'El identificador solo admite minúsculas, números y guiones (2 a 40).' }, 400);
        }
        // Si el identificador ya está tomado, Postgres contesta 23505 y el
        // mensaje crudo trae el nombre del índice: "empresas_slug_key". Eso
        // no le dice nada a quien está dando de alta su negocio, y suena a
        // que la aplicación se rompió cuando en realidad ya está guardado.
        let filas;
        try {
        filas = await sb.insertar('empresas', [{
          slug,
          nombre: String(datos.nombre || slug).slice(0, 120),
          // Categoría LIBRE: cualquier texto, incluido "Otro". No hay lista
          // cerrada y no debe agregarse una.
          categoria: String(datos.categoria || '').slice(0, 80),
          plan: ['prueba','basico','pro'].includes(datos.plan) ? datos.plan : 'prueba',
          marca: datos.identidad || datos.marca || {},
          saludo: datos.saludo || 'Hola, ¿en qué te ayudo?',
          // Nace como BORRADOR: el asistente de alta tiene varios pasos y
          // nadie debería publicar un negocio a medio llenar.
          estado: 'borrador',
          activa: false,
          politicas: Array.isArray(datos.politicas) ? datos.politicas : [],
          acciones: Array.isArray(datos.acciones) ? datos.acciones : ['derivar_humano'],
        }]);
        } catch (e) {
          if (/23505|duplicate key/i.test(String(e.message))) {
            return json({ error: 'Ya hay un negocio con el identificador «' + slug + '».',
                          codigo: 'slug_ocupado', slug }, 409);
          }
          throw e;
        }
        await sb.bitacora({ actor: yo.id, empresa_id: filas[0].id, accion: 'empresa.crear',
                            detalle: { slug, categoria: datos.categoria || '' } });
        return json({ empresa: filas[0] });
      }

      // Duplicar: copia todo menos identidad y datos de personas. Sirve para
      // dar de alta al segundo cliente parecido sin volver a llenar diez pasos.
      case 'empresas.duplicar': {
        if (!esSuper) return negar();
        const origen = (await sb.seleccionar('empresas', '*', `id=eq.${datos.id}&limit=1`))?.[0];
        if (!origen) return json({ error: 'No encontré esa empresa.' }, 404);
        const slug = aSlug(datos.slug || (origen.slug + '-copia'));

        const copia = {
          slug,
          nombre: String(datos.nombre || origen.nombre + ' (copia)').slice(0, 120),
          categoria: origen.categoria, plan: 'prueba',
          marca: origen.marca, saludo: origen.saludo, sugerencias: origen.sugerencias,
          descargo: origen.descargo, captura: origen.captura,
          politicas: origen.politicas, acciones: origen.acciones,
          estado: 'borrador', activa: false,
        };
        const nueva = (await sb.insertar('empresas', [copia]))[0];

        // Lo cifrado se vuelve a cifrar CON LA LLAVE DE LA EMPRESA NUEVA: la
        // llave se deriva del id, así que copiar el texto cifrado tal cual lo
        // dejaría ilegible para la copia.
        for (const [nombre, col] of Object.entries(SECRETOS)) {
          if (nombre === 'destinos' || nombre === 'llaves') continue;  // no se heredan
          if (!origen[col]) continue;
          try {
            const claro = await descifrar(MAESTRA, origen.id, origen[col]);
            await sb.actualizar('empresas', `id=eq.${nueva.id}`,
              { [col]: await cifrar(MAESTRA, nueva.id, claro) });
          } catch (e) { /* si un campo no se pudo leer, la copia sigue */ }
        }
        await sb.bitacora({ actor: yo.id, empresa_id: nueva.id, accion: 'empresa.duplicar',
                            detalle: { de: origen.slug, a: slug } });
        return json({ empresa: nueva });
      }

      // Publicar: revisa que el perfil esté completo antes de encenderlo.
      case 'empresas.publicar': {
        if (!esDueno) return negar();
        const fila = (await sb.seleccionar('empresas', '*', `id=eq.${datos.id}&limit=1`))?.[0];
        if (!fila) return json({ error: 'No encontré esa empresa.' }, 404);

        let perfilClaro = {};
        try { perfilClaro = await descifrar(MAESTRA, fila.id, fila.perfil_cifrado) || {}; } catch {}
        let conocimiento = [];
        try { conocimiento = await descifrar(MAESTRA, fila.id, fila.conocimiento_cifrado) || []; } catch {}

        const revision = revisarPerfil({ ...perfilClaro, ...fila, conocimiento,
                                         identidad: fila.marca, contactos: fila.contactos });
        if (!revision.listo && !datos.forzar) {
          return json({ error: 'Faltan datos para publicar.', faltan: revision.faltan }, 400);
        }
        const g = await sb.actualizar('empresas', `id=eq.${datos.id}`,
          { estado: 'publicado', activa: true, suspendida_at: null });
        await sb.bitacora({ actor: yo.id, empresa_id: datos.id, accion: 'empresa.publicar', detalle: {} });
        return json({ empresa: g[0] });
      }

      // Borrar los ejemplos. Solo toca lo marcado como semilla: un cliente
      // real nunca lleva esa bandera, así que no hay forma de barrerlo aquí.
      case 'empresas.borrarEjemplos': {
        if (!esSuper) return negar();
        const borradas = await sb.actualizar('empresas', 'ejemplo=is.true',
          { activa: false, estado: 'suspendido' });
        await sb.bitacora({ actor: yo.id, empresa_id: null, accion: 'ejemplos.retirar',
                            detalle: { cuantas: (borradas || []).length } });
        return json({ retiradas: (borradas || []).length });
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
          categoria:   datos.categoria,          // libre, sin lista cerrada
          saludo:      datos.saludo,
          descargo:    datos.descargo,
          marca:       datos.identidad || datos.marca,
          sugerencias: datos.sugerencias,
          captura:     datos.captura,
          contactos:   datos.contactos,
          politicas:   Array.isArray(datos.politicas) ? datos.politicas : undefined,
          acciones:    Array.isArray(datos.acciones) ? datos.acciones : undefined,
          updated_at:  new Date().toISOString(),
        };
        // El plan solo lo mueve el superadmin: es lo que se cobra. Las
        // políticas sí las controla el dueño de la marca — son suyas y de su
        // rubro, no una decisión de la plataforma.
        if (esSuper && datos.plan) cambios.plan = datos.plan;
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

      /* El interruptor del dueño. A DIFERENCIA de `empresas.suspender`, esto
         NO es solo del superadmin: quien recibe la queja del paciente es el
         médico, a las once de la noche, y tiene que poder callar al bot en
         ese momento. Obligarlo a pedirle permiso a la plataforma para dejar
         de decir tonterías sería exactamente al revés de como debe ser.

         RLS ya limita a un dueño a su propia empresa. */
      case 'empresas.modo': {
        if (!esDueno) return negar();
        if (!['activo','recados','apagado'].includes(datos.modo)) {
          return json({ error: 'Modo inválido.' }, 400);
        }
        const g = await sb.actualizar('empresas', `id=eq.${datos.id}`, { modo: datos.modo });
        if (!g?.[0]) return json({ error: 'Esa empresa no existe o no es tuya.' }, 404);
        // Apagar un bot es de las cosas que hay que poder auditar después:
        // «¿desde cuándo dejó de contestar?» debe tener respuesta.
        await sb.bitacora({ actor: yo.id, empresa_id: datos.id, accion: 'empresa.modo',
                            detalle: { modo: datos.modo } });
        return json({ empresa: g[0] });
      }

      /* Vincular el número de WhatsApp del negocio.
         El `phone_number_id` NO es el teléfono: es el identificador que da
         Meta. Se guarda porque es lo único que llega en un mensaje entrante,
         y es como se sabe a qué negocio pertenece.

         Es del DUEÑO: es su número. El índice único de la base impide que
         dos negocios compartan uno, que es como se cruzarían las
         conversaciones de dos clientes distintos. */
      case 'empresas.whatsapp': {
        if (!esDueno) return negar();
        const wid = String(datos.whatsapp_id || '').trim();
        if (wid && !/^\d{5,32}$/.test(wid)) {
          return json({ error: 'El identificador de Meta son solo dígitos.' }, 400);
        }
        try {
          const g = await sb.actualizar('empresas', `id=eq.${datos.id}`,
            { whatsapp_id: wid || null });
          if (!g?.[0]) return json({ error: 'Esa empresa no existe o no es tuya.' }, 404);
          await sb.bitacora({ actor: yo.id, empresa_id: datos.id, accion: 'empresa.whatsapp',
                              detalle: { vinculado: !!wid } });
          return json({ empresa: g[0] });
        } catch (e) {
          if (/23505|duplicate key/i.test(String(e.message))) {
            return json({ error: 'Ese número de WhatsApp ya está vinculado a otro negocio.' }, 409);
          }
          throw e;
        }
      }

      case 'empresas.suspender': {
        if (!esSuper) return negar();
        const activa = !!datos.activa;
        // El `estado` tiene que ir junto: suspender dejaba `activa=false` con
        // `estado='publicado'`, así que la tarjeta decía «publicado» mientras
        // el bot contestaba «fuera de servicio». Una contradicción que desde
        // el panel no hay forma de diagnosticar.
        const g = await sb.actualizar('empresas', `id=eq.${datos.id}`, {
          activa,
          estado: activa ? 'publicado' : 'suspendido',
          suspendida_at: activa ? null : new Date().toISOString(),
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
        // Si la anotación falla, se DICE: leer datos de personas sin dejar
        // rastro es exactamente el momento en que hay que enterarse.
        const anotado = await sb.bitacora({ actor: yo.id, empresa_id: datos.empresa_id || null,
                            accion: 'leads.ver', detalle: { cuantos: leidos.length } });
        return json({ leads: leidos, auditoria: anotado.ok ? undefined : 'no se pudo anotar' });
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

      /* ── buzón de soporte ────────────────────────────────────────────
         Un hilo por reporte, cifrado con la llave derivada del AUTOR.
         Quien reporta una falla cuenta lo que estaba haciendo, y ahí se
         cuelan nombres de pacientes y teléfonos sin que nadie lo note.
         Un buzón de quejas en claro acaba siendo el rincón peor cuidado
         donde viven los datos más delicados. */

      case 'reportes.mios': {
        const filas = await sb.seleccionar('reportes', '*',
          `autor=eq.${yo.id}&order=updated_at.desc&limit=50`);
        return json({ reportes: await abrirHilos(filas) });
      }

      case 'reportes.listar': {
        if (!esSuper) return negar();
        const filtro = datos.estado ? `estado=eq.${encodeURIComponent(datos.estado)}&` : '';
        const filas = await sb.seleccionar('reportes', '*',
          filtro + 'order=updated_at.desc&limit=100');
        return json({ reportes: await abrirHilos(filas) });
      }

      case 'reportes.crear': {
        const asunto = String(datos.asunto || '').trim().slice(0, 140);
        const texto  = String(datos.texto  || '').trim().slice(0, 4000);
        if (!asunto || !texto) return json({ error: 'Falta el asunto o el mensaje.' }, 400);

        const tipo = ['falla','queja','idea','otro'].includes(datos.tipo) ? datos.tipo : 'falla';
        const hilo = [{ de: 'usuario', texto, en: new Date().toISOString() }];

        const filas = await sb.insertar('reportes', [{
          autor: yo.id,
          empresa_id: yo.empresa_id || null,
          asunto, tipo, estado: 'abierto', ultimo_de: 'usuario',
          hilo_cifrado: await cifrar(MAESTRA, yo.id, hilo),
        }]);
        await sb.bitacora({ actor: yo.id, empresa_id: yo.empresa_id || null,
                            accion: 'reporte.abrir', detalle: { tipo } });
        return json({ reporte: { ...filas[0], hilo, hilo_cifrado: undefined } });
      }

      case 'reportes.responder': {
        const texto = String(datos.texto || '').trim().slice(0, 4000);
        if (!texto) return json({ error: 'Escribe el mensaje.' }, 400);

        const fila = (await sb.seleccionar('reportes', '*', `id=eq.${datos.id}&limit=1`))?.[0];
        if (!fila) return json({ error: 'No encontré ese reporte.' }, 404);
        // Solo el superadmin, o quien abrió el hilo. Sin esto, cualquiera con
        // un id ajeno podría escribir dentro de la conversación de otro.
        if (!esSuper && fila.autor !== yo.id) return negar();

        const de = esSuper ? 'admin' : 'usuario';
        let hilo = [];
        try { hilo = await descifrar(MAESTRA, fila.autor, fila.hilo_cifrado) || []; } catch (e) {}
        hilo.push({ de, texto, en: new Date().toISOString() });

        const g = await sb.actualizar('reportes', `id=eq.${datos.id}`, {
          hilo_cifrado: await cifrar(MAESTRA, fila.autor, hilo),
          ultimo_de: de,
          // Que el admin conteste no lo cierra: cerrar es una decisión, no
          // una consecuencia de haber escrito.
          estado: fila.estado === 'abierto' && esSuper ? 'en_proceso' : fila.estado,
          updated_at: new Date().toISOString(),
        });
        return json({ reporte: { ...g[0], hilo, hilo_cifrado: undefined } });
      }

      case 'reportes.estado': {
        if (!esSuper) return negar();
        if (!['abierto','en_proceso','resuelto'].includes(datos.estado)) {
          return json({ error: 'Estado inválido.' }, 400);
        }
        const g = await sb.actualizar('reportes', `id=eq.${datos.id}`,
          { estado: datos.estado, updated_at: new Date().toISOString() });
        await sb.bitacora({ actor: yo.id, empresa_id: null, accion: 'reporte.estado',
                            detalle: { reporte: datos.id, estado: datos.estado } });
        return json({ reporte: g[0] });
      }

      /* ── conversaciones ───────────────────────────────────────────────
         Se guardaban cifradas desde el primer día y NO HABÍA forma de
         leerlas. Ni pantalla, ni endpoint: el dato entraba y no volvía a
         salir nunca. Un chat que archiva lo que le dijeron y no deja
         abrirlo no está guardando, está enterrando.

         Y sin esto, «te paso con una persona» era una promesa hueca: la
         persona no tenía dónde ver qué se había hablado. */
      case 'conversaciones.listar': {
        const partes = [];
        if (datos.empresa_id) partes.push(`empresa_id=eq.${datos.empresa_id}`);
        if (datos.soloUrgencias) partes.push('urgencia=is.true');
        partes.push('order=created_at.desc', 'limit=' + Math.min(+datos.limite || 40, 100));

        const filas = await sb.seleccionar('conversaciones',
          'id,empresa_id,sesion,mensajes_cifrados,urgencia,motivo_urgencia,via,created_at',
          partes.join('&'));

        const abiertas = [];
        for (const f of filas) {
          let mensajes = null, error = null;
          try { mensajes = await descifrar(MAESTRA, f.empresa_id, f.mensajes_cifrados); }
          catch (e) { error = 'no se pudo abrir'; }
          abiertas.push({
            id: f.id, empresa_id: f.empresa_id, sesion: f.sesion,
            urgencia: f.urgencia, motivo_urgencia: f.motivo_urgencia,
            via: f.via, created_at: f.created_at,
            mensajes: mensajes || [], error,
          });
        }

        // Abrir conversaciones de pacientes es exactamente lo que hay que
        // poder auditar después. Se anota SIEMPRE, también cuando lo hace
        // el dueño de la plataforma.
        const anotado = await sb.bitacora({ actor: yo.id, empresa_id: datos.empresa_id || null,
                            accion: 'conversaciones.ver',
                            detalle: { cuantas: abiertas.length,
                                       soloUrgencias: !!datos.soloUrgencias } });
        return json({ conversaciones: abiertas,
                      auditoria: anotado.ok ? undefined : 'no se pudo anotar' });
      }

      /* ── ¿por qué falló la IA? ─────────────────────────────────────────
         El endpoint del chat es público y anónimo, así que cuando todos los
         proveedores fallan solo contesta «se me trabó la conexión». Está
         bien: a un desconocido no se le informa que el sitio está a medio
         montar.

         El problema es que ese detalle no lo veía NADIE — tampoco el dueño.
         Un bot que falla sin dejar forma de saber por qué obliga a adivinar,
         y adivinar sobre proveedores de IA es carísimo en tiempo.

         Aquí sí se cuenta todo, porque de este lado hay una sesión. Los
         mensajes ya vienen limpios de llaves desde `proveedores.mjs`. */
      case 'bot.diagnosticar': {
        if (!esDueno) return negar();
        const arranque = Date.now();
        try {
          const r = await preguntar({
            prompt: 'Contesta exactamente: ok',
            leerEntorno: env,
          });
          return json({ ok: true, via: r.via, origen: r.origen,
                        ms: Date.now() - arranque, intentos: r.intentos || [] });
        } catch (e) {
          return json({ ok: false, codigo: e.codigo || 'FALLO',
                        ms: Date.now() - arranque, intentos: e.intentos || [] });
        }
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

/**
 * Abre los hilos de una lista de reportes.
 *
 * Un hilo que no se puede descifrar NO tumba la lista: se marca y los demás
 * se muestran igual. Perder el buzón entero porque un registro viejo quedó
 * con otra llave sería cambiar un problema chico por uno grande.
 */
async function abrirHilos(filas) {
  const salida = [];
  for (const f of filas || []) {
    let hilo = null, error = null;
    try { hilo = await descifrar(MAESTRA, f.autor, f.hilo_cifrado); }
    catch (e) { error = 'no se pudo abrir'; }
    const { hilo_cifrado, ...resto } = f;
    salida.push({ ...resto, hilo: hilo || [], error });
  }
  return salida;
}
