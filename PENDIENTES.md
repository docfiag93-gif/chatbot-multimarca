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

---

# 10 de noviembre · lo que se encontró y lo que falta

## Lo que estaba roto y ya no

**La base de datos estaba PAUSADA.** El plan gratuito de Supabase la apaga
sola a los 7 días sin uso, y la última vez que se tocó fue el 25 de agosto.
Eso es por qué «no contestaba»: no es que contestara mal, es que no tenía de
dónde leer tu consultorio. Ya está despierta.

⚠️ **Va a volver a pasar.** Cada vez que dejes el proyecto más de una semana
sin que nadie le escriba, la base se apaga. Dos salidas: entrar al panel una
vez por semana, o pasar Supabase a plan de paga.

**El bot decía que no tenías WhatsApp.** Verificado en vivo: preguntándole
por tu WhatsApp —que sí estaba cargado— contestaba «Lo siento, no tenemos
WhatsApp. Puede llamarnos al (phone)». El prompt le ordenaba «ofrece el
contacto» y ningún bloque le pasaba cuál era. Arreglado.

**El número viejo estaba dando la cara.** `9616552222` era lo que el bot
repartía a los pacientes. Cambiado a `529611166263` en la base, verificado
en producción.

**1 de cada 8 pacientes veía «se me trabó la conexión».** Tres fallas
encadenadas en la elección del modelo de Groq. Ahora 10 de 10. El detalle
está en los commits del 10 de noviembre.

**La cola de urgencia nunca había salido.** `seguridad.mjs` la lee de
`contactos.urgencias` y el formulario no tenía ese campo. Ya lo tiene, y
quedó puesto tu número. Verificado: ante un dolor de pecho manda al 911 y
DESPUÉS dice «ya que vayas en camino, avísanos al 529611166263».

**El botón de pánico.** Ahora vive en el pie del cajón, visible en todas las
pantallas, y silencia todos tus negocios de una. Antes eran tres botones de
11 px dentro de la tarjeta.

## Lo que falta, y es tuyo

**1 · La llave de Gemini tiene la cuota agotada.** 429 en el 100% de las
peticiones: «You exceeded your current quota». Hoy no aporta nada. Groq
aguanta solo, pero sin respaldo: el día que Groq tosa, no hay segundo.
Saca una llave nueva en `aistudio.google.com/apikey` y actualiza
`GEMINI_API_KEY` en Cloudflare.

**2 · El token de WhatsApp está muerto otra vez.** El ping dice
`tokenWhatsapp: meta_400`. Los del panel de Meta duran HORAS. El permanente
se saca como «usuario del sistema» en la configuración del portafolio
comercial, y no caduca. Mientras no esté, WhatsApp no contesta.

**3 · `RESEND_API_KEY` no está, y esto es lo más grave de la lista.**
Las urgencias se guardan pero NADIE te avisa. Un dolor de pecho a las 2 de
la mañana queda en la base y tú te enteras cuando abras el panel. Llave
gratis en `resend.com`.

**4 · Tu domicilio fiscal en el aviso de privacidad.** Sigue siendo el único
hueco, y sin publicar la app en Meta tus pacientes reales no pueden
escribirle al bot: hoy solo funcionan los cinco números de prueba.

**5 · Los datos reales del consultorio.** Precios y horarios siguen siendo
ficticios. Negocios → Editar → pasos 4 y 5.

## Facebook, Instagram y TikTok

Lo que se puede y lo que no, sin adornos.

**Messenger e Instagram DM: se puede, y reusa casi todo lo que ya está.**
Llegan por el mismo webhook de Meta que ya existe y ya valida firma; lo que
cambia es la forma del sobre (`entry[].messaging[]` en vez de
`entry[].changes[].value.messages[]`) y el endpoint para contestar. El
cerebro, el anclaje, las banderas de urgencia y el interruptor se usan tal
cual. Son unas 150 líneas.

**Pero no se puede encender hoy**, y no por el código: hace falta que Meta
apruebe los permisos `pages_messaging` e `instagram_manage_messages`, y eso
pasa por App Review, que pide la app publicada, que pide el aviso de
privacidad completo. O sea: el punto 4 de arriba.

**TikTok: no.** No hay API pública de mensajes directos para cuentas de
negocio. No es que falte configurarla — no existe. Lo que sí se puede es
poner el enlace del chat en la bio.

**Y esto funciona HOY, sin pedirle permiso a nadie:** el enlace del widget
en la bio de las tres redes.

    https://chatbot-multimarca.pages.dev/chat.html?marca=consultorio-dr-fernandoisa

Cero aprobaciones, cero tokens, cero espera. Contesta, detecta urgencias,
manda al 911 y toma datos. Es la jugada que no cuesta nada mientras lo demás
se resuelve.
