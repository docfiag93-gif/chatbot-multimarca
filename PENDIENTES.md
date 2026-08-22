# Dónde quedamos · 22 de agosto de 2026

Retomar por el **Paso 1**. Son 15 minutos y desbloquea el panel.

---

## ✅ Lo que YA funciona

| | |
|---|---|
| Sitio en línea | https://chatbot-multimarca.pages.dev |
| El bot responde | Gemini + Groq, con respaldo automático entre los dos |
| Anclaje contra invención | Probado en producción: inventó un horario y el sistema lo atrapó |
| Políticas de urgencia | Probado: cortó antes de llamar a la IA, mandó al 911 |
| Correos de Supabase | Arreglado — ya no mandan a `localhost:3000` |
| Tu cuenta | Creada, confirmada y **ya eres superadmin** en la base |
| Código | Todo subido a GitHub. Nada pendiente de push |

---

## ⏳ PASO 1 · Las dos llaves que faltan

Sin esto el panel no abre, aunque tu cuenta ya exista.

### 1a · La llave del archivero

**https://supabase.com/dashboard/project/gnhndbqbgvtoxhelikcy/settings/api-keys**

Sección **Secret keys** (la de abajo) → fila `default` → botón de copiar.
Ya existe, no hay que crearla.

### 1b · La llave del cifrado

**https://chatbot-multimarca.pages.dev** → pestaña **Herramientas** →
botón **Generar llave** → copiar de inmediato.

> No se guarda en ningún lado. Si recargas antes de copiarla, se pierde y hay
> que generar otra. **Guárdala también en tus notas**: es la que cifra los
> datos de las personas. Si se pierde, esos datos no se pueden leer nunca más.
> Ni por mí, ni por Supabase, ni por nadie.

### 1c · Pegarlas

**https://dash.cloudflare.com** → Workers & Pages → `chatbot-multimarca` →
Ajustes → Variables y secretos → **Agregar**.

Tipo **Secreto** en las dos. Nombres exactos:

```
SUPABASE_SERVICE_KEY
CHATBOT_CLAVE
```

### 1d · Redesplegar  ← el que se olvida

Guardar NO activa las variables. Cloudflare las mete al construir.

Pestaña **Despliegues** → el primero → menú `⋯` → **Retry deployment**.

### 1e · Comprobar

Esto va en la **Terminal**, no en Supabase:

```bash
curl -s 'https://chatbot-multimarca.pages.dev/api/bot?ping=1'
```

Deben decir `true`: `base`, `panel`, `cifrado`.

---

## Ya en Cloudflare (no hay que volver a ponerlas)

```
GEMINI_API_KEY        Secreto
GROQ_API_KEY          Secreto
SUPABASE_URL          Texto
SUPABASE_ANON_KEY     Texto
```

---

## PASO 2 · Entrar al panel

1. https://chatbot-multimarca.pages.dev → **Iniciar sesión**
2. Entra con tu correo y contraseña
3. Debe aparecer la pestaña **Superusuario** (tu rol ya está puesto)

---

## PASO 3 · Opcionales, sin prisa

| Qué | Para qué | Esfuerzo |
|---|---|---|
| `RESEND_API_KEY` | Que salgan los correos de aviso cuando alguien deja sus datos | 10 min |
| Entrar con Google | Supabase → Authentication → Sign In / Providers → Google | ~20 min, necesita Google Cloud |
| Dominio propio | `chat.tudominio.mx` en vez de `.pages.dev` | ~200 pesos al año |
| Llenar los datos reales | Horarios, precios, WhatsApp de tu consultorio | **lo que más rinde** |

---

## Lo grande que sigue pendiente

**WhatsApp.** Es el hueco real frente a VendBot y **no es problema de código**:
verificación de empresa con Meta, número dedicado y plantillas aprobadas.
Semanas de trámite. Si vas en serio, conviene empezarlo en paralelo con todo
lo demás — el código ya está preparado para recibirlo.

**Streaming de respuestas.** Que el texto aparezca palabra por palabra en vez
de de golpe. Requiere cambiar el contrato de la respuesta a SSE. Es trabajo
real, no un ajuste.

**El orden de proveedores por marca.** El servidor ya lo soporta; falta la
pantalla en el panel para configurarlo.

---

## Dos cosas que aprendimos y conviene no repetir

**Guardar una variable no la activa.** Siempre hay que redesplegar. Nos costó
dos vueltas.

**Borrar un archivo no lo quita de internet.** La caché del borde sigue
sirviendo su copia. Hay que *sobrescribirlo*. Así se encontró que
`marcas.mjs` seguía descargable con los prompts dentro.

Para revisar el sitio en vivo cuando quieras:

```bash
bash ~/Desktop/CLAUDE/chatbot/pruebas/auditar-sitio.sh
```

---

## Archivos útiles en esta carpeta

| Archivo | Para qué |
|---|---|
| `CONECTAR-SUPABASE.md` | Los 7 pasos de Supabase, con más detalle |
| `DESPLIEGUE.md` | Cómo funciona el despliegue |
| `abrir.command` | Doble clic para ver la consola en tu Mac |
| `pruebas/abrir-pruebas.command` | Doble clic para correr las 229 pruebas |
| `pruebas/auditar-sitio.sh` | Revisa el sitio publicado |
