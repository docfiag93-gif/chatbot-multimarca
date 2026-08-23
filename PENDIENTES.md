# Dónde quedamos · 23 de agosto de 2026

## ✅ Funcionando en producción

**Tu consultorio está publicado y contestando** en
`https://chatbot-multimarca.pages.dev/chat.html?marca=consultorio-dr-fernandoisa`

Verificado en vivo: da tus precios del catálogo, explica el hígado graso,
NO inventa servicios que no ofreces, y ante «me duele el pecho» corta antes
de llamar a la IA y manda al 911.

⚠️ **Los datos son ficticios.** Precios, horarios y tratamientos hay que
cambiarlos por los reales: Negocios → **Editar** → paso 4 y 5.

⚠️ **Está suspendido.** Alguien le dio a Suspender. Para revivirlo:
Negocios → **Reactivar**.

## 🎛 Canales

| Canal | Estado |
|---|---|
| Web | ✅ Funcionando |
| **Telegram** | ✅ Código listo — faltan 5 min con @BotFather |
| WhatsApp | ✅ Código listo — esperando trámite de Meta |
| Instagram + Messenger | Un adaptador da los dos (mismo formato) |
| TikTok | API existe, es nueva. Al final |

### Encender Telegram (lo más rápido que hay)
1. En Telegram: **@BotFather** → `/newbot` → te da un token
2. Cloudflare: `TELEGRAM_TOKEN` (el token) y `TELEGRAM_SECRETO` (palabra inventada)
3. Redesplegar
4. Registrar el webhook:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://chatbot-multimarca.pages.dev/api/telegram?marca=consultorio-dr-fernandoisa&secret_token=<SECRETO>`

### WhatsApp — lo que falta y lo que NO
- **No existe** «iniciar sesión en WhatsApp» ni conectar la app WhatsApp Business a un bot.
- **Coexistencia** (mismo número en app + API, con QR desde Dispositivos
  vinculados) es lo que usa su primo. Es oficial y sin riesgo, PERO Meta solo
  se la da a Solution Partners y Tech Providers.
- Camino rápido y sin riesgo: **número de prueba de Meta** — gratis, sin
  verificación, y el número del consultorio no se toca.
- Camino estratégico: **volverse Tech Provider**. Semanas de trámite, y es lo
  que le permitiría conectarle el WhatsApp a un colega sin que pierda sus chats.
- **NO usar** Evolution API / Baileys / automatizar WhatsApp Web: Meta banea
  esos números, y sería el canal por donde le escriben sus pacientes.

## 🔴 Lo que sigue (ronda 5)

1. **Bandeja para contestar como persona.** Hoy las conversaciones se pueden
   LEER pero nadie puede responder desde la consola. Sin eso, «te paso con una
   persona» sigue incompleto en todos los canales. Es lo que más falta y no
   depende de ningún trámite.
2. **Agenda** — que el bot aparte horarios reales. Regla: el bot APARTA, el
   médico CONFIRMA. Apartar es reversible; confirmar no.
3. Instagram + Messenger (un adaptador, dos canales).
4. `RESEND_API_KEY` para que los avisos de urgencia salgan por correo.
5. Datos reales del consultorio.

## 📐 Decisión estratégica del día

Su producto tiene tres capas: **canales** (tubería, se renta), **bandeja**
(resuelto hace años, se renta) y **el cerebro médico** (nadie lo vende).
Llevaba dos días en la capa 1, la más copiable y la más lenta.

**Rentar las capas 1 y 2, ser dueño de la 3.**

Documentos: `claude.ai/code/artifact/fc46b79a-880d-4322-826d-b5a7d13f3900`
(caminos de WhatsApp) y `.../61211510-a9d0-487c-8bf9-0dcd60575672` (las capas).

## 🧰 Herramientas nuevas para diagnosticar

- **Herramientas → Probar la IA**: dice qué proveedor contestó, en cuántos ms
  y con qué error si falló. 429 = cuota, 401/403 = llave, 408 = lento.
- `curl -s 'https://chatbot-multimarca.pages.dev/api/bot?ping=1'` (**Terminal**,
  no Supabase) — trae `baseResponde` y `negociosVisibles`.

## ⚠️ Trampas que ya mordieron

- **Guardar una variable en Cloudflare no la activa.** Hay que redesplegar.
- **Al redesplegar, siempre el primero de la lista.**
- `base: true` significaba «la variable está puesta», no «la base contesta».
  Ya se distinguen.
- La llave **publicable** en `SUPABASE_SERVICE_KEY` no da error: devuelve cero
  filas. Cero filas y «no existe» se ven igual.
- Un `UPDATE` en SQL nunca devuelve renglones. «0 rows» no es error.
- **Los comandos con `curl` van en la Terminal del Mac, NO en Supabase.**

**276 pruebas** pasan. Todo subido y desplegado.
