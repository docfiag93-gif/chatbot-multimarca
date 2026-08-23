# Dónde quedamos · 22 de agosto de 2026

**Las seis llaves ya están puestas y activas.** El siguiente paso es entrar al
panel y dar de alta el primer negocio real.

---

## ✅ Lo que YA funciona

| | |
|---|---|
| Sitio en línea | https://chatbot-multimarca.pages.dev |
| El bot responde | Gemini + Groq, con respaldo automático entre los dos |
| Anclaje contra invención | Probado en producción |
| Políticas de urgencia | Probado: corta antes de llamar a la IA, manda al 911 |
| Base de datos | ✅ conectada |
| Acceso al panel | ✅ encendido |
| Cifrado | ✅ encendido |
| Tu cuenta | Creada, confirmada y **superadmin** |

Las seis variables en Cloudflare: `GEMINI_API_KEY`, `GROQ_API_KEY`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `CHATBOT_CLAVE`.

---

## ✅ Hecho el 22-ago (tarde) — falta hacer commit y desplegar

| Qué | Dónde |
|---|---|
| Portada sin sesión (antes se veía la consola a medias) | `publico/index.html` |
| Tarjetas de negocio clicables + acciones (probar, copiar, publicar, suspender, duplicar) | `publico/index.html` |
| Paleta oscura medida contra WCAG AA | `publico/index.html` |
| Recuperación de contraseña (vale para dueño y superadmin) | `publico/index.html` |
| WhatsApp ahora llega con la pregunta ya escrita | `publico/widget.js` |
| El visitante se recuerda entre visitas (solo el id, no lo que dijo) | `publico/widget.js` |
| El código para pegar en el sitio del cliente ya es absoluto | `publico/index.html` |

Todo probado en local. Las 9 pruebas de cifrado siguen pasando.
**No se ha hecho commit ni despliegue** — eso lo decides tú.

Guía completa: https://claude.ai/code/artifact/a3647cc8-4522-4873-81a3-5b16702e32dd

---

## ⚠️ Sin subir todavía (segunda tanda del 22-ago)

| Qué | Por qué |
|---|---|
| El asistente ya no duplica | Guardar dos veces daba `409 empresas_slug_key`. Ahora adopta el negocio que ya existe |
| «Guardar borrador» guarda TODO | Antes solo guardaba cuatro campos; el catálogo y los horarios se perdían |
| La sesión sobrevive al cierre | Se guarda el pase de renovación. Ya no pide enlace nuevo cada vez |
| Selector «Viendo: …» en el encabezado | Para ser dueño de su consultorio Y administrador de la plataforma sin confundirlos |

**El consultorio ya está en la base pero VACÍO** (`consultorio-dr-fernandoisa`,
borrador, sin perfil ni conocimiento). Hay que volver a pasar el asistente
después de subir esto — ya no va a chocar.

---

## 🚨 Hallazgo del 22-ago que ordenó todo lo demás

**Las solicitudes se guardaban y NADIE podía leerlas.** El servidor tenía
`leads.listar` (que además descifra) desde el principio; ninguna pantalla lo
llamaba. El tablero decía «3 personas esperan» y el botón «Ver y responder»
llevaba al panel de plataforma, donde no había ninguna lista de solicitudes.

Alguien pudo llenar el formulario esperando una llamada que nunca iba a
llegar, y desde el panel todo se veía en orden. Por eso esto se hizo antes
que la portada, el buzón y Google.

**Ya está:** pestaña «Solicitudes», con nombre, WhatsApp en un clic, motivo,
filtro de pendientes y «Marcar atendido». Respeta el selector de contexto.

## 🔧 El bloqueo real: no se podía EDITAR un negocio

Fernando: «no hay nada, ni cómo vincular el WhatsApp ni cómo ponerle
contexto». Tenía razón, y el motivo era otro: **el asistente solo servía para
CREAR.** Una vez creado el negocio no había botón para volver a abrirlo, así
que los campos existían pero eran inalcanzables.

`empresas.detalle` (que además descifra) estaba en el servidor desde el
principio y ninguna pantalla lo llamaba — el mismo patrón que con `leads.listar`.

**Ya está:** botón **Editar** en cada tarjeta, primero y en sólido. Trae el
negocio al asistente con todo lleno y al guardar actualiza en vez de duplicar.

⚠️ **Trampa esquivada:** el asistente NO pregunta horarios, ubicaciones ni
objetivos, pero el perfil sí los guarda. Guardar desde el formulario los
habría borrado en silencio. Se conservan en `extrasDelNegocio` y solo se pisa
lo que el formulario controla. Si algún día se agregan campos de horarios al
asistente, hay que quitarlos de ahí.

**También:** el campo de WhatsApp estaba hasta el fondo del paso 5, debajo de
dos listas de casillas. Ahora abre el paso. Y el paso 4 trae ejemplos
desplegables para un consultorio (tratamientos, diabetes, primera visita,
costos, horarios).

## ✅ Buzón de soporte — HECHO (22-ago)

Tabla `reportes` **ya creada en Supabase** (migración `buzon_de_reportes`).
El archivo `db/02-reportes.sql` queda como respaldo; no hay que volver a correrlo.

Una sola pestaña **Soporte** para los dos lados: quien usa la plataforma abre
hilos y ve los suyos; el superadmin los ve todos, contesta y mueve el estado
(abierto → en proceso → resuelto).

Decisiones que conviene no deshacer:

- **El hilo va cifrado.** Quien reporta una falla cuenta qué estaba haciendo,
  y ahí se cuelan nombres de pacientes sin que nadie lo note.
- **Una cuenta `pendiente` SÍ puede escribir al buzón.** Es justo quien más
  necesita reportar («llevo tres días esperando que me activen»). Dejarla
  fuera convertía un trámite lento en un callejón sin salida.
- **Un dueño NO ve los reportes de su equipo.** Si un empleado se queja de su
  jefe, el jefe no debe leerlo desde el panel donde administra su negocio.

**Aislamiento probado contra la base real**, no supuesto: corriendo como
`authenticated` (no como dueño de la tabla — ese se salta RLS y ya dio
aprobados falsos una vez): superadmin ve 2, el otro usuario ve 1 suyo y
**0 ajenos**. Datos de prueba borrados.

## 🔌 Interruptor del bot — HECHO (22-ago)

Columna `modo` en `empresas`, **ya migrada** (`db/03-modo-del-bot.sql` es
respaldo, no hay que correrlo). Tres estados en la tarjeta de cada negocio:

| | Qué hace |
|---|---|
| **Contestando** | Normal, con IA |
| **Solo recados** | No llama a la IA. Dice que contesta una persona y toma nombre y teléfono |
| **Apagado** | No contesta. Manda a escribir directo |

Es del **dueño**, no solo del superadmin: quien recibe la queja del paciente
es el médico, de noche.

⚠️ **La urgencia clínica corre en los TRES estados.** La primera versión
cortaba por «apagado» antes del filtro y un «me duele el pecho» se habría ido
sin el 911. Por eso el orden vive en `decidirSinIA()` (pura, probada) y no
suelto en el manejador. Si alguien mueve ese orden, seis pruebas se ponen
rojas.

## 🚨 Pendiente de comprobar en cuanto se despliegue

El bot **no puede leer los negocios de la base**: `?config=1&marca=…` de su
consultorio devuelve la marca neutral (`id: null`, «Asistente»). La sospecha
firme es que `SUPABASE_SERVICE_KEY` trae la llave PUBLICABLE: con esa,
PostgREST no falla, devuelve CERO FILAS. Prueba con MCP (service_role): la
fila sí existe y sí es visible. Por eso el bot no actúa como service_role.

Ya está el instrumento para confirmarlo: `?ping=1` ahora trae
`baseResponde` y `negociosVisibles`.

## 🔴 Lo que Fernando pidió y NO está hecho

Por orden en que lo dijo. Nada de esto está construido todavía.

1. **Dos cuentas separadas** — DECIDIDO 22-ago: `doc.fiag93@gmail.com` se
   queda de **superadmin**. Él crea la segunda cuenta con otro correo y esa
   será la dueña del consultorio. Yo no puedo crear cuentas; una vez que
   exista, se asigna desde el panel de plataforma (Usuarios → rol `dueno` +
   negocio) o con SQL.
2. **Rediseñar la portada** — «no me gusta». Falta saber qué no le gusta.
3. **Conectar Google** y que no pida confirmar el correo.
5. **Mejorar la interacción del panel de usuario.**

## ✅ Arreglado el 22-ago (tercera tanda) — sin subir

| Qué | Detalle |
|---|---|
| **El bot ya no se traba 30 s** | Medido en producción: 30.7 s antes de rendirse. Ahora hay presupuesto total de 9 s y 6 s por intento |
| El cliente ya no elige la IA | El paso «Modelo» solo lo ve la plataforma. Se asigna; si una falla entra la otra |
| El asistente ya no duplica | El `409 empresas_slug_key` de antes |
| «Guardar borrador» guarda todo | Antes perdía catálogo y horarios |
| La sesión sobrevive al cierre | Ya no pide enlace nuevo cada vez |
| Selector «Viendo: …» | Ser dueño y administrador sin confundirlos |
| **Pantalla de solicitudes** | Ver el hallazgo de arriba |

Las 229 pruebas pasan.

---

## ⏳ PASO SIGUIENTE · Dar de alta el primer negocio

La base está vacía a propósito: los cuatro negocios que ves en el sitio
(consultorio, café, tienda, proveedor) son **ejemplos que viven en el archivo**,
no en la base. Por eso el bot contesta pero todavía no guarda nada.

Guardar se enciende solo cuando existe un negocio **real** en la base, porque
cada conversación se cifra con el identificador de ese negocio.

1. Entrar a https://chatbot-multimarca.pages.dev → pestaña **Acceso**
2. Iniciar sesión con tu correo
3. Pestaña **Negocios** → dar de alta el consultorio con datos de verdad

Ahí es donde está la ganancia grande: **datos reales**. El bot ya es bueno;
lo que le falta es saber de qué está hablando.

---

## Opcionales

| Qué | Para qué | Cuánto cuesta |
|---|---|---|
| `RESEND_API_KEY` | Que las urgencias te lleguen por correo | gratis |
| Google OAuth | Entrar con Google en vez de contraseña | ~20 min |
| Dominio propio | Verse serio | ~200 pesos/año |

## Pendientes grandes

- **WhatsApp** — verificación con Meta, semanas. No es problema de código.
- **Respuesta en streaming** — que las letras aparezcan mientras piensa.
- **Orden de proveedores por marca** — el servidor ya lo soporta, falta la UI.

---

## Trampas que ya nos mordieron

> **Guardar una variable no la activa.** Siempre hay que redesplegar.
>
> **Al redesplegar, siempre el primero de la lista.** Reintentar uno viejo
> vuelve a publicar el código viejo.
>
> **Borrar un archivo no lo quita de internet.** La caché del borde sigue
> sirviendo su copia. Hay que *sobrescribirlo*.
>
> **Un `UPDATE` en SQL nunca devuelve renglones.** "0 rows returned" no es error.
