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

## 🔴 Lo que Fernando pidió y NO está hecho

Por orden en que lo dijo. Nada de esto está construido todavía.

1. **Dos cuentas separadas** — DECIDIDO 22-ago: `doc.fiag93@gmail.com` se
   queda de **superadmin**. Él crea la segunda cuenta con otro correo y esa
   será la dueña del consultorio. Yo no puedo crear cuentas; una vez que
   exista, se asigna desde el panel de plataforma (Usuarios → rol `dueno` +
   negocio) o con SQL.
2. **Rediseñar la portada** — «no me gusta». Falta saber qué no le gusta.
3. **Conectar Google** y que no pida confirmar el correo.
4. **Buzón de quejas** — un chat de los usuarios hacia el administrador para
   reportar fallas.
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
