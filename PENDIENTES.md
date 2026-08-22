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
