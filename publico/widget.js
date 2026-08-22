/* ══════════════════════════════════════════════════════════════════════════
 *  El widget — la burbuja de chat que se pega en cualquier sitio
 *
 *  Se usa así, y nada más:
 *      <script src="/chatbot/widget.js" data-marca="consultorio" defer></script>
 *
 *  Tres decisiones que explican cómo está escrito:
 *
 *  1) NO es módulo ES. Es un <script> de toda la vida, sin imports. Así se
 *     puede abrir el HTML con doble clic para probarlo: file:// bloquea los
 *     módulos por CORS y la página se quedaría en blanco, que es exactamente
 *     el bug que ya nos mordió con las rutas absolutas.
 *
 *  2) Vive dentro de un Shadow DOM. El widget va a terminar pegado en el
 *     sitio de la marca personal, en EspecialistaYa y mañana en el del café,
 *     cada uno con su propio CSS. Sin shadow, cualquier `.btn { }` ajeno le
 *     deforma los botones. Adentro del shadow, el CSS de afuera no entra.
 *
 *  3) No sabe NADA de la marca. Los colores, el saludo y los campos se los
 *     pide al servidor. Por eso el mismo archivo, sin tocar una coma, sirve
 *     para el consultorio y para el café.
 * ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var script   = document.currentScript;
  var MARCA    = (script && script.dataset.marca)    || 'consultorio';
  // /api/bot funciona igual en Cloudflare (nativo) y en Netlify (por una
  // reescritura en netlify.toml). Así el widget no sabe dónde está alojado,
  // que es justo lo que permite mudarlo sin tocar los sitios de los clientes.
  var ENDPOINT = (script && script.dataset.endpoint) || '/api/bot';
  var WHATSAPP = (script && script.dataset.whatsapp) || '';   // solo dígitos, con lada

  // Si el servidor no contesta (abriste el archivo con doble clic, o la
  // función todavía no está desplegada), el widget NO se rompe: se pinta con
  // esto y avisa que está en modo local. Es feo quedarse sin bot, pero es
  // mucho peor una burbuja que no abre y nadie sabe por qué.
  var RESPALDO = {
    id: MARCA, nombre: 'Chat', dominio: 'comercial',
    marca: { primario: '#0f766e', acento: '#14b8a6', fondo: '#fff', texto: '#0f172a', burbujaIA: '#f0fdfa', avatar: '💬' },
    saludo: 'Hola, ¿en qué te ayudo?',
    sugerencias: [], descargo: '', contactos: {},
    captura: { activa: false, titulo: '', campos: [], confirmacion: '' },
  };

  var cfg = RESPALDO;
  var mensajes = [];        // [{ rol:'usuario'|'bot', texto }]
  var abierto = false;
  var ocupado = false;
  var modoLocal = false;
  var raiz, caja, lista, entrada, chips, boton;

  var CLAVE = 'chatbot:' + MARCA;

  // Un identificador anónimo por pestaña, solo para agrupar los mensajes de
  // una misma charla en el panel. No identifica a nadie: se pierde al cerrar.
  function idSesion() {
    var k = CLAVE + ':sesion';
    var v = sessionStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }

  /* ── utilidades ─────────────────────────────────────────────────────── */

  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  // El texto del bot se inserta SIEMPRE como textContent, nunca como innerHTML:
  // viene de un modelo de lenguaje, y un modelo puede ser convencido de
  // escribir un <script>. Lo único que se interpreta es **negrita**, y se
  // construye con nodos, no con HTML.
  function conNegritas(texto) {
    var frag = document.createDocumentFragment();
    String(texto).split(/(\*\*[^*]+\*\*)/g).forEach(function (parte) {
      if (/^\*\*[^*]+\*\*$/.test(parte)) frag.appendChild(el('strong', null, parte.slice(2, -2)));
      else if (parte) frag.appendChild(document.createTextNode(parte));
    });
    return frag;
  }

  function guardar() {
    try { sessionStorage.setItem(CLAVE, JSON.stringify(mensajes.slice(-20))); } catch (e) {}
  }
  function recuperar() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE)) || []; } catch (e) { return []; }
  }

  /* ── pintar ─────────────────────────────────────────────────────────── */

  var CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

  .lanzador {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
    width: 60px; height: 60px; border-radius: 50%; border: 0; cursor: pointer;
    background: var(--primario); color: #fff; font-size: 26px; line-height: 1;
    box-shadow: 0 10px 26px rgba(0,0,0,.28);
    display: grid; place-items: center;
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .lanzador:hover { transform: scale(1.06); }
  .lanzador:focus-visible { outline: 3px solid var(--acento); outline-offset: 3px; }

  .panel {
    position: fixed; right: 18px; bottom: 88px; z-index: 2147483000;
    width: min(380px, calc(100vw - 36px));
    height: min(560px, calc(100vh - 120px));
    background: var(--fondo); color: var(--texto);
    border-radius: 18px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,.3);
    display: none; grid-template-rows: auto 1fr auto;
    animation: entra .18s ease;
  }
  .panel[data-abierto="1"] { display: grid; }
  @keyframes entra { from { opacity: 0; transform: translateY(12px); } }

  /* En celular ocupa la pantalla: un panel de 380px flotando en un iPhone
     deja el teclado encima del campo de texto. */
  @media (max-width: 480px) {
    .panel { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
    .lanzador[data-abierto="1"] { display: none; }
  }

  .cabecera {
    background: var(--primario); color: #fff; padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .cabecera .avatar { font-size: 22px; }
  .cabecera .titulo { font-weight: 700; font-size: 15px; flex: 1; line-height: 1.25; }
  .cabecera .cerrar {
    background: rgba(255,255,255,.18); border: 0; color: #fff; cursor: pointer;
    width: 30px; height: 30px; border-radius: 50%; font-size: 17px; line-height: 1;
  }

  .lista { overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }

  .burbuja {
    max-width: 85%; padding: 10px 13px; border-radius: 14px;
    font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  }
  .burbuja.bot     { background: var(--burbujaIA); border-bottom-left-radius: 4px; align-self: flex-start; }
  .burbuja.usuario { background: var(--primario); color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }

  /* La respuesta de urgencia NO se ve como las demás. Si alguien está leyendo
     esto en pánico, el bloque rojo tiene que gritar antes que las palabras. */
  .burbuja.urgencia {
    background: #fef2f2; color: #7f1d1d; border: 2px solid #dc2626;
    max-width: 100%; font-weight: 500;
  }

  .escribiendo { display: flex; gap: 4px; padding: 12px 14px; align-self: flex-start; align-items: center; }
  .escribiendo span { font-size: 12px; color: #64748b; margin-left: 6px; }
  .escribiendo i {
    width: 7px; height: 7px; border-radius: 50%; background: var(--primario); opacity: .45;
    animation: late 1s infinite;
  }
  .escribiendo i:nth-child(2) { animation-delay: .15s; }
  .escribiendo i:nth-child(3) { animation-delay: .3s; }
  @keyframes late { 50% { opacity: 1; transform: translateY(-3px); } }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }
  .chips button {
    background: transparent; border: 1.5px solid var(--acento); color: var(--primario);
    border-radius: 999px; padding: 7px 12px; font-size: 13px; cursor: pointer;
  }
  .chips button:hover { background: var(--burbujaIA); }

  .pie { border-top: 1px solid rgba(0,0,0,.08); padding: 10px 12px; }
  .fila { display: flex; gap: 8px; align-items: flex-end; }
  .fila textarea {
    flex: 1; resize: none; border: 1.5px solid rgba(0,0,0,.14); border-radius: 12px;
    padding: 10px 12px; font-size: 14.5px; max-height: 110px; min-height: 42px;
    background: #fff; color: var(--texto);
  }
  .fila textarea:focus { outline: 0; border-color: var(--acento); }
  .fila button {
    background: var(--primario); color: #fff; border: 0; border-radius: 12px;
    width: 42px; height: 42px; font-size: 17px; cursor: pointer; flex: none;
  }
  .fila button:disabled { opacity: .45; cursor: not-allowed; }

  .descargo { font-size: 10.5px; color: #64748b; text-align: center; margin-top: 7px; line-height: 1.4; }

  .form { display: flex; flex-direction: column; gap: 8px; padding: 12px;
          background: var(--burbujaIA); border-radius: 14px; margin: 0 14px 10px; }
  .form h4 { margin: 0; font-size: 14px; color: var(--primario); }
  .form label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 3px; }
  .form input, .form textarea {
    width: 100%; border: 1.5px solid rgba(0,0,0,.14); border-radius: 9px;
    padding: 8px 10px; font-size: 14px; background: #fff; color: var(--texto);
  }
  .form textarea { resize: vertical; min-height: 58px; }
  .form .aviso { font-size: 11px; line-height: 1.45; display: flex; gap: 7px; align-items: flex-start; }
  .form .aviso input { width: auto; margin-top: 2px; flex: none; }
  .form .acciones { display: flex; gap: 8px; }
  .form .acciones button {
    flex: 1; border: 0; border-radius: 10px; padding: 10px; font-size: 14px;
    font-weight: 600; cursor: pointer;
  }
  .form .enviar { background: var(--primario); color: #fff; }
  .form .cancelar { background: transparent; color: #64748b; border: 1.5px solid rgba(0,0,0,.12); }
  .form .error { font-size: 12px; color: #b91c1c; }

  /* Estados. Un chat que falla en silencio es peor que uno que no existe:
     la persona se queda esperando sin saber que ya no va a llegar nada. */
  .aviso-estado {
    margin: 0 14px 8px; padding: 9px 12px; border-radius: 9px;
    font-size: 13px; line-height: 1.45; display: flex; gap: 9px; align-items: flex-start;
  }
  .aviso-estado.sinred { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .aviso-estado.error  { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .aviso-estado button {
    background: transparent; border: 1.5px solid currentColor; color: inherit;
    border-radius: 7px; padding: 3px 10px; font-size: 12.5px; cursor: pointer;
    font-weight: 600; flex: none; align-self: center;
  }
  .aviso-estado .txt { flex: 1; }

  .wa {
    display: block; text-align: center; margin: 0 14px 10px; padding: 10px;
    background: #25d366; color: #fff; border-radius: 10px; font-size: 14px;
    font-weight: 600; text-decoration: none;
  }`;

  function construir() {
    var host = el('div');
    host.id = 'chatbot-' + MARCA;
    document.body.appendChild(host);
    raiz = host.attachShadow({ mode: 'open' });

    var estilo = document.createElement('style');
    estilo.textContent = CSS;
    raiz.appendChild(estilo);

    var c = cfg.marca;

    // Las variables se cuelgan del :host para que las tomen tanto el
    // lanzador como el panel, que son hermanos dentro del shadow.
    raiz.host.style.setProperty('--primario',  c.primario);
    raiz.host.style.setProperty('--acento',    c.acento);
    raiz.host.style.setProperty('--fondo',     c.fondo);
    raiz.host.style.setProperty('--texto',     c.texto);
    raiz.host.style.setProperty('--burbujaIA', c.burbujaIA);

    boton = el('button', 'lanzador');
    boton.textContent = c.avatar;
    boton.setAttribute('aria-label', 'Abrir chat de ' + cfg.nombre);
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-haspopup', 'dialog');
    boton.addEventListener('click', alternar);
    raiz.appendChild(boton);

    caja = el('div', 'panel');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'false');
    caja.setAttribute('aria-label', 'Chat de ' + cfg.nombre);

    var cab = el('div', 'cabecera');
    cab.appendChild(el('span', 'avatar', c.avatar));
    cab.appendChild(el('div', 'titulo', cfg.nombre));
    var cerrar = el('button', 'cerrar', '✕');
    cerrar.setAttribute('aria-label', 'Cerrar chat');
    cerrar.addEventListener('click', alternar);
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    lista = el('div', 'lista');
    // role=log + aria-live: el lector de pantalla anuncia los mensajes nuevos
    // sin robarle el foco a quien está escribiendo.
    lista.setAttribute('role', 'log');
    lista.setAttribute('aria-live', 'polite');
    lista.setAttribute('aria-relevant', 'additions');
    lista.setAttribute('aria-label', 'Conversación');
    caja.appendChild(lista);

    var pie = el('div', 'pie');
    chips = el('div', 'chips');
    pie.appendChild(chips);

    var fila = el('div', 'fila');
    entrada = el('textarea');
    entrada.rows = 1;
    entrada.placeholder = 'Escribe tu mensaje…';
    entrada.setAttribute('aria-label', 'Tu mensaje');
    entrada.addEventListener('input', function () {
      entrada.style.height = 'auto';
      entrada.style.height = Math.min(entrada.scrollHeight, 110) + 'px';
    });
    entrada.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(entrada.value); }
    });
    fila.appendChild(entrada);

    var mandar = el('button', null, '➤');
    mandar.setAttribute('aria-label', 'Enviar');
    mandar.addEventListener('click', function () { enviar(entrada.value); });
    fila.appendChild(mandar);
    pie.appendChild(fila);

    if (cfg.descargo) pie.appendChild(el('div', 'descargo', cfg.descargo));
    caja.appendChild(pie);
    raiz.appendChild(caja);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && abierto) alternar();
    });

    // El navegador avisa cuando vuelve la red. Aprovecharlo evita que la
    // persona se quede mirando un mensaje de error que ya no es cierto.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('offline', function () {
        if (abierto) mostrarAviso('sinred', 'Te quedaste sin internet.');
      });
      window.addEventListener('online', function () {
        var a = raiz.querySelector('.aviso-estado.sinred');
        if (!a) return;
        quitarAviso();
        if (ultimoTexto) {
          mostrarAviso('sinred', 'Ya volvió el internet.',
            { etiqueta: 'Reintentar', hacer: function () { quitarAviso(); reenviar(); } });
        }
      });
    }
  }

  function alternar() {
    abierto = !abierto;
    caja.dataset.abierto = abierto ? '1' : '0';
    boton.dataset.abierto = abierto ? '1' : '0';
    boton.textContent = abierto ? '✕' : cfg.marca.avatar;
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    boton.setAttribute('aria-label', (abierto ? 'Cerrar' : 'Abrir') + ' chat de ' + cfg.nombre);
    // Al cerrar, el foco vuelve al lanzador: si se queda en un elemento
    // oculto, quien navega con teclado se pierde dentro de la página.
    if (!abierto) boton.focus();
    if (abierto) {
      if (!mensajes.length) {
        pintarBot(cfg.saludo);
        pintarChips(cfg.sugerencias);
        mensajes.push({ rol: 'bot', texto: cfg.saludo });
      }
      setTimeout(function () { entrada.focus(); }, 60);
    }
  }

  /* ── mensajes ───────────────────────────────────────────────────────── */

  function pintarUsuario(texto) {
    var b = el('div', 'burbuja usuario', texto);
    lista.appendChild(b); abajo();
  }
  function pintarBot(texto, urgencia) {
    var b = el('div', 'burbuja bot' + (urgencia ? ' urgencia' : ''));
    b.appendChild(conNegritas(texto));
    lista.appendChild(b); abajo();
  }
  function pintarChips(sugs) {
    chips.textContent = '';
    (sugs || []).forEach(function (s) {
      var b = el('button', null, s);
      b.addEventListener('click', function () { enviar(s); });
      chips.appendChild(b);
    });
  }
  function abajo() { lista.scrollTop = lista.scrollHeight; }

  // El bot está configurado para LEER antes de contestar, así que puede
  // tardar unos segundos. Tres puntitos mudos durante cinco segundos se
  // sienten como que se colgó, y la persona cierra la ventana. A los 2 s se
  // le pone nombre a la espera.
  var avisoTimer = null;
  function puntitos(mostrar) {
    var viejo = raiz.querySelector('.escribiendo');
    if (viejo) viejo.remove();
    clearTimeout(avisoTimer);
    if (!mostrar) return;

    var d = el('div', 'escribiendo');
    d.appendChild(el('i')); d.appendChild(el('i')); d.appendChild(el('i'));
    lista.appendChild(d); abajo();

    avisoTimer = setTimeout(function () {
      if (d.isConnected && !d.querySelector('span')) {
        d.appendChild(el('span', null, 'leyendo tu mensaje…'));
        abajo();
      }
    }, 2000);
  }

  // ── Estados visibles ──────────────────────────────────────────────────
  // Se muestran DENTRO de la lista, no como alerta del navegador: la persona
  // está mirando la conversación, no la barra de direcciones.
  var ultimoTexto = null;

  function quitarAviso() {
    var a = raiz.querySelector('.aviso-estado');
    if (a) a.remove();
  }

  function mostrarAviso(clase, mensaje, accion) {
    quitarAviso();
    var d = el('div', 'aviso-estado ' + clase);
    d.setAttribute('role', 'status');
    d.appendChild(el('span', 'txt', mensaje));
    if (accion) {
      var b = el('button', null, accion.etiqueta);
      b.addEventListener('click', accion.hacer);
      d.appendChild(b);
    }
    lista.appendChild(d); abajo();
  }

  function sinConexion() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;

    // Si no hay red, no se gasta una petición que ya se sabe que falla: se
    // avisa y se ofrece reintentar cuando vuelva.
    if (sinConexion()) {
      pintarUsuario(texto);
      entrada.value = ''; entrada.style.height = 'auto';
      ultimoTexto = texto;
      mostrarAviso('sinred', 'Parece que te quedaste sin internet. Tu mensaje no se envió.',
        { etiqueta: 'Reintentar', hacer: function () { quitarAviso(); reenviar(); } });
      return;
    }
    quitarAviso();

    entrada.value = ''; entrada.style.height = 'auto';
    pintarUsuario(texto);
    pintarChips([]);
    ultimoTexto = texto;
    mensajes.push({ rol: 'usuario', texto: texto });
    guardar();

    if (modoLocal) {
      pintarBot('Estoy en modo local: no hay servidor conectado, así que no puedo responder de verdad. Súbelo a Netlify y aquí sí contesto.');
      return;
    }

    ocupado = true; puntitos(true);
    pedirRespuesta();
  }

  /**
   * La llamada al servidor, separada de enviar() para poder repetirla tal
   * cual desde el botón de reintentar, sin volver a pintar el mensaje ni
   * duplicarlo en el historial.
   */
  function pedirRespuesta() {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marca: MARCA, mensajes: mensajes, sesion: idSesion() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        puntitos(false); ocupado = false;
        quitarAviso();
        if (d.error) { pintarBot(d.error); return; }

        pintarBot(d.texto, d.urgencia);
        mensajes.push({ rol: 'bot', texto: d.texto });
        guardar();

        if (d.urgencia) {
          // En urgencia no se vende nada: ni formulario, ni sugerencias.
          // Solo el número de urgencias, y SIEMPRE debajo del 911, que ya
          // salió en el bloque rojo. El orden en pantalla importa.
          enlaceWhatsapp('urgencia');
          return;
        }
        if (d.accion === 'capturar_cita' && cfg.captura.activa) formulario();
        else if (d.accion === 'derivar_humano') enlaceWhatsapp('general');
        else pintarChips(d.sugerencias);
      })
      .catch(function () {
        puntitos(false); ocupado = false;
        // Un botón de reintentar convierte un callejón sin salida en un
        // tropiezo. Sin él, la única salida es cerrar y volver a empezar.
        mostrarAviso('error', sinConexion()
          ? 'Sigues sin internet. Cuando vuelva, reintenta.'
          : 'No pude conectarme.',
          { etiqueta: 'Reintentar', hacer: function () { quitarAviso(); reenviar(); } });
        enlaceWhatsapp('general');
      });
  }

  // El botón manda al número que toca según el caso: no es lo mismo pedir una
  // cita que estar en una urgencia. Los números salen de la configuración de
  // la empresa; data-whatsapp queda como respaldo para sitios sencillos.
  function contactoPara(caso) {
    var c = cfg.contactos || {};
    var elegido = caso === 'urgencia' ? (c.urgencias || c.consultorio)
                                      : (c.consultorio || c.urgencias);
    var numero = (elegido && (elegido.whatsapp || elegido.telefono)) || WHATSAPP;
    if (!numero) return null;
    return {
      numero: String(numero).replace(/\D/g, ''),
      etiqueta: (elegido && elegido.etiqueta) ||
                (caso === 'urgencia' ? 'Escribir a urgencias' : 'Escribir por WhatsApp'),
    };
  }

  /**
   * Repite el último mensaje sin volver a agregarlo al historial: ya está
   * ahí. Duplicarlo haría que el modelo lea la misma pregunta dos veces y
   * conteste como si la persona insistiera.
   */
  function reenviar() {
    if (!ultimoTexto || ocupado) return;
    var yaEsta = mensajes.length && mensajes[mensajes.length - 1].rol === 'usuario';
    if (!yaEsta) mensajes.push({ rol: 'usuario', texto: ultimoTexto });
    ocupado = true; puntitos(true);
    pedirRespuesta();
  }

  function enlaceWhatsapp(caso) {
    if (raiz.querySelector('.wa')) return;
    var c = contactoPara(caso);
    if (!c) return;
    var a = el('a', 'wa', c.etiqueta);
    a.href = 'https://wa.me/' + c.numero;
    a.target = '_blank'; a.rel = 'noopener';
    lista.appendChild(a); abajo();
  }

  /* ── el formulario de contacto ──────────────────────────────────────── */

  function formulario() {
    if (raiz.querySelector('.form')) return;

    var f = el('div', 'form');
    f.appendChild(el('h4', null, cfg.captura.titulo));

    var campos = {};
    cfg.captura.campos.forEach(function (c) {
      var cont = el('div');
      cont.appendChild(el('label', null, c.etiqueta + (c.requerido ? ' *' : '')));
      var i = c.tipo === 'textarea' ? el('textarea') : el('input');
      if (c.tipo !== 'textarea') i.type = c.tipo;
      cont.appendChild(i); f.appendChild(cont);
      campos[c.id] = i;
    });

    // La casilla no es adorno: la LFPDPPP pide consentimiento para tratar
    // datos personales, y el motivo de consulta es dato sensible. Sin esto
    // marcado el servidor rechaza el envío.
    var aviso = el('label', 'aviso');
    var check = el('input'); check.type = 'checkbox';
    aviso.appendChild(check);
    aviso.appendChild(document.createTextNode(
      'Acepto que usen mis datos para contactarme. ' +
      (cfg.dominio === 'clinico' ? 'Entiendo que esto no es una cita confirmada.' : '')
    ));
    f.appendChild(aviso);

    var err = el('div', 'error'); f.appendChild(err);

    var acc = el('div', 'acciones');
    var cancelar = el('button', 'cancelar', 'Ahora no');
    cancelar.addEventListener('click', function () { f.remove(); });
    var enviarBtn = el('button', 'enviar', 'Enviar');
    enviarBtn.addEventListener('click', function () {
      var lead = { consiente: check.checked };
      var falta = '';
      cfg.captura.campos.forEach(function (c) {
        lead[c.id] = campos[c.id].value.trim();
        if (c.requerido && !lead[c.id]) falta = 'Falta ' + c.etiqueta.toLowerCase() + '.';
      });
      if (falta) { err.textContent = falta; return; }
      if (!check.checked) { err.textContent = 'Marca la casilla para poder contactarte.'; return; }

      enviarBtn.disabled = true; enviarBtn.textContent = 'Enviando…'; err.textContent = '';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marca: MARCA, tipo: 'lead', lead: lead }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'falló');
          f.remove();
          pintarBot(res.d.texto || cfg.captura.confirmacion);
        })
        .catch(function (e) {
          enviarBtn.disabled = false; enviarBtn.textContent = 'Enviar';
          err.textContent = String(e.message || e);
          enlaceWhatsapp('general');
        });
    });
    acc.appendChild(cancelar); acc.appendChild(enviarBtn);
    f.appendChild(acc);

    lista.appendChild(f); abajo();
  }

  /* ── arranque ───────────────────────────────────────────────────────── */

  fetch(ENDPOINT + '?config=1&marca=' + encodeURIComponent(MARCA))
    .then(function (r) { if (!r.ok) throw new Error('sin config'); return r.json(); })
    .then(function (c) { cfg = c; })
    .catch(function () { modoLocal = true; })
    .then(function () {
      mensajes = recuperar();
      construir();
      // Se repintan los mensajes de la sesión anterior para que quien vuelve
      // a la página no sienta que empezó de cero.
      mensajes.forEach(function (m) {
        if (m.rol === 'usuario') pintarUsuario(m.texto); else pintarBot(m.texto);
      });
    });
})();
