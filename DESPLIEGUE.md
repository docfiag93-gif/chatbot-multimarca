# Cómo subirlo a Cloudflare Pages (gratis)

## Por qué se mueve

El chatbot compartía sitio con la app médica en Netlify. Dos problemas con eso,
y el segundo importa más que el dinero:

1. Cada despliegue del chatbot reconstruía también la app de los pacientes.
2. Las llamadas del chatbot consumían la misma cuota. Si el bot se pone
   popular —o alguien lo abusa— se lleva entre las patas la app que usan
   tus pacientes.

Cloudflare Pages: **ancho de banda ilimitado**, 100 mil llamadas de función
al día, 500 compilaciones al mes. Y permite uso comercial en el plan gratuito,
cosa que **Vercel no** — su plan Hobby lo prohíbe, y tú planeas vender esto.

## El código ya está listo para las dos plataformas

No hay que elegir de golpe. La misma lógica corre en Netlify y en Cloudflare:

```
chatbot/servidor/bot.mjs      ← la lógica, sin saber dónde vive
chatbot/servidor/admin.mjs

netlify/functions/bot.mjs     ← envoltorio Netlify (2 líneas)
functions/api/bot.js          ← envoltorio Cloudflare (10 líneas)
```

Lo que hacía falta para eso: `chatbot/cerebro/entorno.mjs`. Netlify corre sobre
Node y usa `process.env`; Cloudflare corre sobre Workers, donde `process` **no
existe** y las variables llegan por petición. Ese archivo traduce, y el resto
del código pregunta `env('X')` sin enterarse.

Además el widget ya pega a **`/api/bot`**, que funciona igual en los dos lados
(en Netlify por una reescritura en `netlify.toml`). Los sitios que ya tengan el
widget pegado **no hay que tocarlos** cuando se haga el cambio.

## Los pasos

### 1. Conectar el repo
En Cloudflare → Workers & Pages → Create → Pages → Connect to Git →
`docfiag93-gif/isa-plataformas`.

### 2. La configuración de compilación
| Campo | Valor |
|---|---|
| Framework preset | None |
| Build command | *(vacío)* |
| Build output directory | `chatbot` |
| Root directory | *(vacío, la raíz del repo)* |

El comando de compilación va vacío a propósito: no hay nada que compilar, son
archivos estáticos. Cloudflare encuentra solo la carpeta `functions/` de la raíz.

### 3. Las variables (Settings → Variables and Secrets)
Marca **todas** como *Secret*, no como *Variable de texto*:

```
CHATBOT_CLAVE          # consola → Herramientas → Generar llave
SUPABASE_URL           = https://gnhndbqbgvtoxhelikcy.supabase.co
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
GROQ_API_KEY
RESEND_API_KEY
```

### 4. Comprobar que quedó
Abre `https://<tu-proyecto>.pages.dev/api/bot?ping=1`. Debe contestar con
`base: true`, `cifrado: true` y los proveedores que tengan llave.

Luego la consola en `https://<tu-proyecto>.pages.dev/` y, en Herramientas,
**Correr pruebas** — si el cifrado pasa sus 10 casos, el despliegue quedó bien.

### 5. Cuando funcione, apagar el de Netlify
Borra `netlify/functions/bot.mjs` y `admin.mjs`, y la reescritura de `/api/*`
en `netlify.toml`. **No antes**: mientras existan los dos, puedes volverte
atrás en un minuto.

## Dos cosas honestas

**No pude confirmar qué está consumiendo tus créditos.** La API de Netlify no
expone los contadores de consumo. Si el gasto no eran las funciones sino el
ancho de banda de la app médica, mover el chatbot ayuda poco — el consumo
seguiría en `isahealthcore`. Vale la pena mirar el panel de Netlify
(Team → Usage) antes de dar el problema por resuelto. Ya nos pasó una vez
diagnosticar mal esto.

**`chatbot/cerebro/` y `chatbot/servidor/` quedan descargables**, porque están
dentro de la carpeta que se publica. No hay secretos ahí: las llaves viven en
variables de entorno y nunca en los archivos. Lo que sí queda a la vista es el
texto del prompt en `marcas.mjs` — y eso deja de pasar en cuanto las marcas se
muevan a la base, donde ya viajan cifradas.
