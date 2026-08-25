# Dónde quedamos · 25 de agosto de 2026

## 🔜 Lo único que de verdad te bloquea

Tres cosas, en orden. Todo lo demás puede esperar.

**1 · Tu domicilio fiscal en el aviso de privacidad.**
Es el ÚNICO hueco que queda en `publico/aviso-privacidad.html` — búscalo, está
marcado en amarillo. Calle, número, colonia, municipio, estado y C.P.
Sin esto no se puede publicar la app en Meta, y sin publicar la app tus
pacientes reales no pueden escribirle al bot: hoy solo funcionan los cinco
números de prueba.

**2 · El token permanente de WhatsApp.**
El que da el panel de Meta dura HORAS, no días. Ya se venció dos veces. El
permanente se saca en la configuración del negocio, como «usuario del sistema»,
y no caduca. Mientras no esté, el bot se queda mudo cada tarde sin avisar.

**3 · Los datos reales de tu consultorio.**
Precios, horarios y tratamientos siguen siendo ficticios. Negocios → Editar →
pasos 4 y 5.

### Para el jueves · seguridad

Fernando lo pidió así: «un cifrado extremo, que sea inhackeable, para no tener
robo empresarial y de datos». La meta es la correcta; la palabra no.

**Nada es inhackeable, y quien te venda eso te está mintiendo.** Lo que sí
existe es hacer que robar no valga la pena y que, si pasa, se note. Y de eso
ya hay bastante puesto:

- Cada negocio tiene **su propia llave** derivada. Robar la base sin la llave
  maestra no da nada legible.
- El aislamiento entre consultorios está **probado con dos negocios reales**,
  corriendo como usuario normal y no como dueño de las tablas — que es donde
  una prueba mal hecha aprueba en falso.
- Los secretos **nunca** entran a los registros, ni siquiera cuando Meta
  devuelve un error que los trae dentro.

Lo que falta no es un algoritmo más fuerte. Es lo aburrido:

1. **Rotación de la llave maestra** — hoy si se filtra, no hay forma de
   cambiarla sin perder lo cifrado.
2. **Segundo factor** para entrar al panel. Hoy una contraseña robada da
   acceso completo, y es el camino más barato para un atacante: nadie rompe
   AES-256, todos prueban contraseñas.
3. **Qué pasa el día que pase.** No hay plan escrito de cómo cortar accesos,
   avisar a los afectados y cumplir el plazo que marca la ley.

El punto 2 es el que más te compra por lo que cuesta. Empezamos por ahí.

### Y una que NO te bloquea, para que no te agobie

El **abogado** que revise el aviso de privacidad hace falta cuando empieces a
VENDERLE a colegas —ahí te vuelves encargado de datos de terceros—, no para
operar tu propio consultorio. Puedes arrancar y arreglarlo en paralelo.

---


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

## 🔑 META · dónde quedó exactamente (24-ago)

**Hecho y NO se pierde:**
- Portafolio comercial **«Chatbot ISA»** creado, correo `doc.fiag93@gmail.com`
  confirmado, Fernando con acceso total.

**Falta un solo paso, y es suyo:** al final del asistente de creación de la
app, Meta pide **volver a escribir la contraseña de Facebook**. Yo no tecleo
contraseñas, ni con autorización.

⚠️ La vez pasada se dio clic en **«¿Olvidaste tu contraseña?»** y eso canceló
todo el asistente (manda a facebook.com/login/identify). Hay que escribir la
contraseña en el campo y darle **Enviar**. El campo no muestra nada mientras
se escribe: es normal.

**Para retomar** (yo puedo llevarlo otra vez hasta ahí en ~2 minutos):
1. `developers.facebook.com/apps/creation/`
2. Nombre: `Chatbot Multimarca ISA`
3. Casos de uso → Mensajes comerciales → **Conectarte con los clientes a
   través de WhatsApp**
4. Negocio → **Chatbot ISA**
5. Requisitos → dice «No hay requisitos» ✅ (o sea: número de prueba sin
   verificación de negocio)
6. Crear app → **contraseña** ← él

**Después de eso, sigo yo:** `phone_number_id` del número de prueba,
registrar su celular como destinatario, webhook a `/api/whatsapp`,
suscribir `messages`, y vincular el número al negocio desde la consola.
Los tokens los pega él en Cloudflare.

**UNA app sirve para TODOS sus clientes.** No se crea una por cliente: cada
negocio conecta su número a la misma app, y `empresas.whatsapp_id` (único)
es lo que distingue a quién le escribieron. Esa app ES el producto que va a
vender.

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
