# Conectar WhatsApp

App de Meta: **Chatbot ISA** · identificador `1067220599037347`
Portfolio comercial: **Chatbot ISA** · `2273547910045137`

---

## El orden importa, y es al revés de lo que uno haría

El instinto dice: configuro el webhook en Meta y luego pongo las llaves.
**Así no funciona.** Cuando das de alta el webhook, Meta llama al servidor en
ese mismo instante para comprobar que es tuyo. Si la palabra secreta todavía
no está puesta del lado del servidor, la llamada rebota y Meta te dice «no se
pudo validar la URL» — sin decirte por qué.

Así que: **primero las tres llaves en Cloudflare, luego el webhook en Meta.**

Si de todos modos rebota, no adivines: entra a la consola, sección
**Superusuario → Bitácora**, y busca `whatsapp.verificacion_rechazada`. Ahí
dice exactamente cuál de los dos problemas fue:

- `sin_variable` → la palabra secreta no está en el servidor. Falta el paso 1.
- `no_coincide` → está puesta, pero no es la misma que escribiste en Meta.

---

## Paso 1 · Inventar la palabra secreta

Es un texto que tú eliges y que va **igual en los dos lados**. No la saca
Meta; la pones tú. Sirve para que el servidor sepa que quien llama es Meta.

Genera una al azar (no uses «hola123»: cualquiera que adivine esa palabra
puede darse de alta como si fuera tu webhook):

```bash
python3 -c "import secrets; print(secrets.token_hex(24))"
```

Cópiala. La vas a usar dos veces y después no la necesitas.

---

## Paso 2 · Sacar las otras dos de Meta

En el panel de tu app:

**La clave secreta de la app** → `Configuración de la app` → `Básica` →
«Clave secreta de la app» → *Mostrar*.
Sirve para comprobar la firma de cada mensaje que llega. Sin ella, cualquiera
que descubra la URL puede escribirle a tu bot haciéndose pasar por Meta.

**El token de acceso** → `WhatsApp` → `Configuración de la API`.
Es con lo que el bot **contesta**. Ahí mismo aparece el
`phone_number_id`, que también vas a necesitar (paso 5).

> ⚠️ El token que te da esa pantalla **dura 24 horas**. Sirve para probar hoy.
> Para que no se caiga solo mañana hace falta uno permanente, de «usuario del
> sistema», y eso se hace en la configuración del negocio. Cuando llegues ahí,
> avísame.

---

## Paso 3 · Ponerlas en Cloudflare

Panel de Cloudflare → tu proyecto `chatbot-multimarca` → **Settings** →
**Environment variables** → *Production*:

| Variable | De dónde sale | Para qué |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | la que inventaste en el paso 1 | el apretón de manos |
| `WHATSAPP_APP_SECRET`   | Configuración de la app → Básica | comprobar que quien llama es Meta |
| `WHATSAPP_TOKEN`        | WhatsApp → Configuración de la API | contestar los mensajes |

**Después hay que volver a desplegar.** Las variables no entran en vivo: el
código que ya está corriendo no las ve hasta que se levanta de nuevo.

Para comprobar que quedaron, sin enseñar ningún valor:

```bash
curl -s "https://chatbot-multimarca.pages.dev/api/bot?ping=1" | python3 -m json.tool
```

Busca `"whatsapp"` en `capacidades`. Si dice `true`, las tres están.

Y si pones solo una o dos, la consola te va a avisar en el tablero: ese estado
a medias es el peligroso, porque Meta cree que hay integración y falla de un
modo que parece que el bot está roto.

---

## Paso 4 · Ahora sí, el webhook en Meta

`WhatsApp` → `Configuración` → sección **Webhook** → *Editar*:

- **URL de devolución de llamada:**
  `https://chatbot-multimarca.pages.dev/api/whatsapp`
- **Token de verificación:** la palabra del paso 1, **idéntica**.

Guarda. Si sale verde, quedó.

Después, en esa misma pantalla, **suscríbete al campo `messages`**. Sin esa
suscripción el webhook queda dado de alta y no llega ni un mensaje: Meta lo
tiene registrado y no le manda nada. Es el olvido más común de este trámite.

---

## Paso 5 · Decirle a la consola cuál número es de quién

Un mensaje de WhatsApp no trae el nombre del negocio: trae **a qué número le
escribieron**. Así es como el servidor sabe de quién es la conversación.

En la consola → `Negocios` → tu consultorio → botón **WhatsApp** → pega el
`phone_number_id` (el número largo de la pantalla de Configuración de la API).

**No es tu teléfono.** Confundirlos es el error más común de este paso.

---

## Cómo saber que funciona

1. Manda un mensaje al número de prueba desde tu celular.
2. En la consola, `Charlas`: la conversación debe aparecer.
3. Si no aparece, mira `Superusuario → Bitácora`.

Y recuerda que el interruptor sigue ahí: si el bot se aloca contestando por
WhatsApp, `Negocios` → tu consultorio → modo **apagado** lo calla en segundos,
sin borrar nada. Las urgencias siguen saliendo aunque esté apagado.
