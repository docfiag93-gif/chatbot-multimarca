# Chatbot

Un solo programa que atiende varias marcas. Hoy el consultorio; mañana, el café.

## La idea en una frase

El chat no sabe de quién es. Los colores, la personalidad, lo que sabe y los
campos del formulario viven en `cerebro/marcas.mjs`. Para estrenar una marca
nueva se copia un bloque de ese archivo y se cambia el contenido: **no se toca
ni una línea del widget ni del servidor.**

Ya está comprobado, no es una promesa: el mismo `widget.js` cargado dos veces
en la misma página, con distinto `data-marca`, levanta dos bots independientes
—uno verde con 🩺 y otro café con ☕— sin pisarse.

## Los archivos

| Archivo | Qué hace |
|---|---|
| `widget.js` | La burbuja. Se pega en cualquier sitio con una línea. No sabe de marcas. |
| `index.html` | Banco de pruebas. Cambia de marca, muestra el estado del servidor. |
| `cerebro/marcas.mjs` | **Aquí se edita el contenido.** Personalidad, colores, base de conocimiento. |
| `cerebro/cerebro.mjs` | Arma el prompt. No habla con nadie ni tiene llaves. |
| `cerebro/seguridad.mjs` | Las banderas rojas. |
| `servidor/bot.mjs` | El único que ve las API keys y habla con los modelos. |

## Cómo se pega en un sitio

```html
<script src="/chatbot/widget.js"
        data-marca="consultorio"
        data-whatsapp="521961XXXXXXX"
        defer></script>
```

Una línea antes de `</body>`. Sin jQuery, sin React, sin build. Vive dentro de
un Shadow DOM, así que el CSS del sitio no lo deforma y el suyo no ensucia el
sitio.

## Las banderas rojas: por qué el código decide y no la IA

Si alguien escribe «me duele el pecho», esa frase **nunca llega al modelo**.
`seguridad.mjs` la intercepta y devuelve una instrucción fija: llama al 911.

La razón es que un modelo de lenguaje es probabilístico. Casi siempre manda a
urgencias a quien lo necesita —pero «casi siempre» no sirve cuando del otro
lado hay un infarto. El filtro está calibrado para pecar de sensible: es mejor
mandar a urgencias a diez que no lo necesitaban, que dejar pasar a uno que sí.

Corre en el servidor, no en el navegador, para que no se pueda saltar editando
la página desde la consola.

Cubre ocho motivos: dolor torácico, dificultad respiratoria, déficit
neurológico, pérdida del estado de alerta, sangrado activo, urgencia
obstétrica, descompensación metabólica y riesgo suicida. **Solo se activa en
marcas con `dominio: 'clinico'`** — el bot del café no carga con eso.

Están probadas contra 36 frases reales (22 que deben disparar, 14 que no).
Para volver a correr la prueba después de tocar un patrón:

```bash
python3 chatbot/pruebas/probar_banderas.py
```

Tres frases que hoy funcionan y en la primera versión NO disparaban, por si
sirve de recordatorio de que hay que probar: «me duele el pecho» (el patrón
pedía el sustantivo *dolor*), «quiero quitarme la vida» y «se me ahoga mi hijo»
(el verbo estaba conjugado en primera persona; quien escribe muchas veces no
es quien se está ahogando).

## Los modelos

Cuatro proveedores en cadena. Si uno se queda sin cuota, entra el siguiente:
que Gemini devuelva 429 deja de ser problema del paciente.

| Orden | Variable | Nota |
|---|---|---|
| 1 | `ANTHROPIC_API_KEY` | Claude Opus 5. El que mejor respeta los límites clínicos. |
| 2 | `GEMINI_API_KEY` | Ya configurada. |
| 3 | `OPENAI_API_KEY` | Opcional. |
| 4 | `GROQ_API_KEY` | Gratis y rapidísimo: buen último recurso. |

Se cambia el orden con `BOT_ORDEN` (ej. `gemini,groq`) sin tocar código.

**El bot lee antes de contestar.** `CLAUDE_ESFUERZO` está en `high`: revisa
toda la conversación y su base de conocimiento antes de escribir, en vez de
disparar lo primero que se le ocurre —que es justo el bot que se inventa un
horario. Cuesta unos segundos más y más tokens. Si el volumen lo hace pesar,
se baja a `medium` desde las variables del proyecto.

Otras variables: `CLAUDE_MODELO` (por omisión `claude-opus-5`),
`OPENAI_MODELO`, y `LEADS_TO` / `RESEND_API_KEY` para el correo de avisos
(si no pones `LEADS_TO`, usa el `ALERTA_TO` que ya existe).

## Probarlo en local

```bash
python3 -m http.server 8791
```

Y abrir `http://127.0.0.1:8791/chatbot/index.html`. Se ve el widget y se pueden
afinar colores y textos sin gastar un despliegue. Lo que **no** funciona
en local son las respuestas: para eso hace falta la función desplegada.

Estado del servidor, sin gastar una llamada de IA:
`/api/bot?ping=1`

## Lo que falta antes de ponerlo frente a un paciente

1. **Llenar `cerebro/marcas.mjs`.** Todo lo que dice `«POR LLENAR»` es un dato
   que yo no podía inventar: horarios, dirección, costos, servicios, WhatsApp.
   Sin eso el bot contesta correctamente «no tengo ese dato» a todo, que es
   honesto pero inútil. **Este es el trabajo que más rinde, más que cualquier
   modelo:** Opus 5 sin datos tampoco sabe cuánto cuesta la consulta.
2. **Poner las llaves de proveedor** en Cloudflare (ver abajo).
3. **Decidir el aviso de privacidad.** El formulario ya exige que la persona
   marque una casilla, pero esa casilla debería enlazar a un aviso real.
4. **Probarlo tú mismo con frases de paciente**, no de programador.

---

# Multiempresa, usuarios y cifrado

## Base propia, a propósito

El chatbot vive en un Supabase **aparte**: `chatbot-multimarca`
(`gnhndbqbgvtoxhelikcy`). No comparte base, ni cuentas, ni tablas con
`nutri-isa app`.

La razón no es de orden, es de riesgo: vender el chatbot significa dar cuentas
a empleados de otras empresas. Si vivieran en el mismo `auth.users` que los
médicos que abren expedientes, un solo error de RLS expondría a 28 pacientes
reales. Con dos bases, ese error es imposible por construcción.

Cuesta $0: el plan gratuito permite dos proyectos.

## Quién ve qué — probado, no supuesto

| Quién | Empresas | Leads | Leads de otra empresa | Usuarios |
|---|---|---|---|---|
| Dueño de la empresa A | 1 (la suya) | 1 | **0** | 1 |
| Superadministrador | todas | todos | — | todos |
| Cuenta recién registrada | 0 | 0 | 0 | 0 |
| Visitante sin cuenta (`anon`) | 0 | 0 | 0 | 0 |

Se comprobó suplantando cada rol contra la base real, con RLS activa. Se
verificó `current_user` en cada corrida: la primera versión de la prueba daba
falsos aprobados porque corría como dueño de las tablas, y **los dueños se
saltan RLS por diseño**. Si repites la prueba, revisa siempre ese campo.

Una cuenta nueva nace con rol `pendiente`, sin empresa y desactivada. No ve
nada hasta que el superadministrador la asigne.

## El cifrado

Cifrado en la **función**, no en la base. AES-256-GCM, con una llave derivada
por empresa (HKDF) a partir de una llave maestra que vive solo en las
variables de Cloudflare como `CHATBOT_CLAVE`.

- **Protege contra:** respaldo robado, base mal configurada, alguien mirando
  las tablas. Lo que sale es ilegible.
- **NO protege contra:** quien tenga la llave maestra.

Por qué no `pgcrypto`, aunque está instalado: ahí la llave viaja dentro de la
consulta SQL y termina en los registros de la base — la llave guardada al lado
de lo que protege.

Va cifrado: datos de contacto, conversaciones, base de conocimiento, llaves API
de cada empresa y tus destinos de aviso. **No** va cifrado lo que el visitante
ve de todos modos: colores, saludo y los WhatsApp públicos.

Para probarlo: consola → **Herramientas → Correr pruebas** (10 casos, incluida
la rotación de llave).

## Los tres números

| Grupo | Qué es | Dónde vive |
|---|---|---|
| Público | A cuáles escribe el visitante: consultorio y urgencias | `empresas.contactos`, sin cifrar |
| Privado | A dónde te llegan los avisos a TI | `empresas.destinos_cifrados`, cifrado |

El widget elige solo: en urgencia manda al número de urgencias, en cualquier
otro caso al del consultorio. Probado con 10 casos.

## Los avisos

Cuando el filtro detecta una urgencia o alguien deja sus datos, sale un correo
con **un archivo .ics que trae alarma** y un enlace de un clic a Google
Calendar. El teléfono lo agenda y suena, en Android y en iPhone.

No se usa la API de Google Calendar todavía porque exige OAuth, proyecto en
Google Cloud y renovar tokens. El `.ics` logra lo mismo y funciona hoy.

**La jerarquía, que no es negociable:** al paciente ya se le indicó llamar al
911 en el acto, antes de que salga tu aviso. El correo es para que te enteres y
des seguimiento — no para que alguien espere a que lo leas. La respuesta al
paciente sale primero y el aviso corre detrás (`waitUntil`), para que un correo
lento nunca retrase un "llama al 911".

El asunto del correo nunca lleva nombre, teléfono ni síntoma: ese texto se ve
en la pantalla bloqueada del celular.

## Variables que necesita Cloudflare

```
CHATBOT_CLAVE          # generar en Herramientas → Generar llave
SUPABASE_URL           = https://gnhndbqbgvtoxhelikcy.supabase.co
SUPABASE_ANON_KEY      # llave publicable
SUPABASE_SERVICE_KEY   # llave de servicio — SOLO servidor, nunca al navegador
ANTHROPIC_API_KEY      # opcional
RESEND_API_KEY         # para que salgan los avisos
```

## Migración desde marcas.mjs

`resolverMarca()` busca primero en la base y se cae al archivo si no encuentra.
El chatbot que ya funciona no se rompe al activar la base, y las marcas se
pueden mover una por una. El campo `origen` dice de dónde salió cada
configuración.

## Lo que falta

1. **Crear tu cuenta y volverte superadmin.** Regístrate en el panel; nace
   `pendiente`. Después hay que ponerte `superadmin` a mano una sola vez:
   `update usuarios set rol='superadmin', activo=true where email='...';`
2. **Las variables de Cloudflare** de arriba.
3. **Llenar los datos reales.** Sigue siendo lo que más rinde.
4. **Aviso de privacidad de verdad**, enlazado desde la casilla del formulario.

---

# Proveedores de IA

## Cómo se elige quién contesta

Tres niveles, de mayor a menor precedencia:

1. **La marca** — `proveedores: ['groq','gemini']` dentro de su configuración cifrada
2. **La instalación** — variable `BOT_ORDEN`
3. **Por omisión** — `gemini,groq`

Para cada proveedor, **la llave de la marca gana sobre la de la plataforma**.
Así un cliente puede traer su propia cuenta y pagar su propio consumo sin que
eso afecte a las demás marcas ni obligue a tocar código.

## Qué pasa cuando algo falla

| Situación | Comportamiento |
|---|---|
| Proveedor tarda más de 15 s | Se corta y pasa al siguiente |
| Error pasajero (429, 5xx, red) | Un reintento con espera corta, después el siguiente |
| Llave rechazada (401, 403) | **No** se reintenta: es configuración, no un pico |
| Todos fallan | Mensaje útil al visitante + detalle técnico solo del lado del servidor |
| Sin ninguna llave | El visitante nunca lee «falta una API key» |

El límite y los reintentos se ajustan con `msLimite` y `reintentos`; los
valores por omisión están en `publico/cerebro/proveedores.mjs`.

## Diagnóstico

`/api/bot?ping=1` responde qué está configurado y qué falta, **sin revelar
ningún valor**: solo nombres de variables y booleanos. Cada problema trae
gravedad, explicación y cómo arreglarlo.

# Pruebas

```bash
python3 -m http.server 8796
```

- `http://127.0.0.1:8796/pruebas/pruebas.html` — 60 pruebas de encaminamiento,
  aislamiento entre marcas, respaldo, reintento, tiempo límite, errores
  seguros, degradación y cifrado. Usa `fetch` simulado: **no gasta cuota**.
- `python3 pruebas/probar_banderas.py` — 36 casos de banderas rojas.

# Documentación

`docs/arquitectura-multimarca.html` es el informe de diseño de la plataforma.
Vive fuera de `publico/`, así que **no se despliega**: es documentación
interna, no parte del producto.


---

# Cualquier negocio, sin tocar código

## Qué cambió

Antes el sistema solo conocía dos cosas: `clinico` y `comercial`. Estaba metido
hasta en la restricción de la base de datos, así que dar de alta una tienda, un
taller o una inmobiliaria exigía cambiar el esquema y volver a desplegar.

Ahora un negocio se describe con **categoría libre** y **políticas opt-in**:

| Antes | Ahora |
|---|---|
| `dominio: 'clinico' \| 'comercial'` | `categoria` — texto libre, «Otro» incluido |
| Las reglas clínicas se encendían solas | `politicas: []` — ninguna por omisión |
| Solo existía «capturar_cita» | `acciones` — cotizar, reservar, agendar, mostrar catálogo… |
| Campos fijos | `atributos` — lo que no cupo, sin tocar el esquema |

## Los archivos

| Archivo | Qué es |
|---|---|
| `cerebro/perfil.mjs` | El modelo. **No conoce ningún rubro.** |
| `cerebro/politicas.mjs` | Módulos opt-in. Ninguno se enciende solo. |
| `cerebro/acciones.mjs` | Qué puede hacer el bot en cada negocio. |
| `cerebro/catalogos-ui.mjs` | Sugerencias de la interfaz. No validan nada. |
| `cerebro/semillas.mjs` | **Ejemplos borrables.** Cuatro giros distintos. |
| `cerebro/marcas.mjs` | Capa de compatibilidad. Se borra cuando ya nadie la use. |

## Las semillas son ejemplos, no el producto

`semillas.mjs` se puede **borrar entero** y el sistema sigue funcionando. Hay una
prueba que lo verifica leyendo el código del núcleo y buscando vocabulario de
cualquier rubro: si aparece, la prueba falla.

Desde el panel, «borrar ejemplos» solo toca lo marcado con `ejemplo: true`. Un
cliente real nunca lleva esa bandera.

## El asistente de alta

Siete pasos: Datos básicos → Identidad → Oferta → Conocimiento → Comportamiento
→ Proveedores → Vista previa. Permite categoría «Otro», campos personalizados,
guardar borrador y duplicar un negocio existente.

Antes de publicar, revisa el perfil y dice **exactamente qué falta** — no un
«no está listo» que obliga a adivinar.

## Compatibilidad

Las filas que ya existan con `dominio` no pierden nada: se traduce a categoría
legible, y **solo** las marcadas como clínicas conservan su política. Ninguna
otra la hereda por su giro.


---

# Anclaje: que no invente datos duros

## El problema

Un modelo de lenguaje **siempre** contesta. Si no sabe el horario, se lo
inventa con total naturalidad: «abrimos de 9 a 6» suena idéntico venga de la
base de conocimiento o de la nada. El resultado es alguien parado frente a una
cortina cerrada un domingo.

Pedirlo en el prompt ayuda, pero no basta: **el prompt es una petición, no una
garantía.**

## La garantía

Después de que el modelo responde, se extraen los datos duros —precios, horas,
días, teléfonos, porcentajes— y se comprueba que **cada uno exista** en lo que
el negocio cargó. El que no aparezca está inventado.

| Respuesta | Resultado |
|---|---|
| «La afinación sale en $1,800» (está en el catálogo) | pasa |
| «Son 1800 pesos» (mismo dato, otro formato) | pasa |
| «La afinación cuesta $2,500» (no existe) | **degradada** |
| «También abrimos el domingo» (cerrado) | **degradada** |
| «Con gusto te ayudo» | pasa — no es un dato |

Cuando detecta invención **no corrige**: corregir con otro dato inventado es el
mismo error. Admite el hueco y ofrece a una persona — exactamente lo que haría
un empleado honesto que no se sabe el precio.

## Lo que NO revisa, a propósito

Afirmaciones generales («somos rápidos», «el envío es sencillo»). Un
verificador que bloquea lenguaje normal convierte al bot en un robot inútil, y
entonces alguien lo apaga. Hay pruebas específicas de que no da falsos
positivos.

También quita las muletillas de robot: «como asistente de IA», «estoy aquí
para ayudarte», «espero que te sea de utilidad».

## Entrada con Google

El panel acepta Google además de correo y contraseña. Quien administra un
negocio ya tiene sesión de Google en su teléfono; pedirle que invente otra
contraseña es fricción, y la que inventa suele ser mala.

**Falta configurarlo:** en Supabase → Authentication → Providers → Google, con
un ID de cliente de Google Cloud. El código ya está.
