# Conectar Supabase — paso a paso

Guárdalo. No hay prisa: el bot **habla sin esto**. Supabase es para que
además *guarde* las conversaciones y funcione el panel de administración.

---

## Qué son las tres cosas

Piensa en tu base de datos como tu consultorio:

| | Qué es | ¿Se comparte? |
|---|---|---|
| **La dirección** | Dónde está | Sí, va en la tarjeta |
| **Llave de la sala de espera** | Deja entrar, no abre expedientes | Sí, no es secreto |
| **Llave del archivero** | Abre TODO | **Nunca** |

---

## Paso 1 · La dirección y la llave pública

Estas dos ya las tienes. Cópialas tal cual:

```
SUPABASE_URL
https://gnhndbqbgvtoxhelikcy.supabase.co
```

```
SUPABASE_ANON_KEY
sb_publishable_vSDvUv6W2vpbEQACqAewLw_ubYlcU5t
```

> La segunda no es secreta a propósito: Supabase misma dice
> *"safe to use in a browser"*. Lo que protege los datos no es esconderla,
> son las reglas de acceso de la base.

---

## Paso 2 · La llave del archivero

1. Entra a
   **https://supabase.com/dashboard/project/gnhndbqbgvtoxhelikcy/settings/api-keys**

2. Baja a la sección **Secret keys** (la de abajo, dice *"privileged access"*).

3. ¿Hay una llave listada?
   - **Sí** → dale al botón de copiar.
   - **No** → botón **New secret key**, nómbrala `chatbot`, y **cópiala en ese
     momento**. Supabase solo te la muestra una vez.

4. Esa llave se llama `SUPABASE_SERVICE_KEY`.

> ⚠️ Ésta abre todos los expedientes de todos los negocios. No la pegues en
> un chat, ni en un correo, ni me la enseñes a mí. Solo en Cloudflare.

---

## Paso 3 · La llave del cifrado

Esta **no existe todavía**. La creas tú:

1. Abre **https://chatbot-multimarca.pages.dev**
2. Pestaña **Herramientas** → botón **Generar llave**
3. Sale un texto largo → **cópialo ya**. No se guarda en ningún lado: si
   recargas la página, se pierde.
4. Se llama `CHATBOT_CLAVE`.

> Se genera en tu navegador y no viaja a ningún servidor. Por eso ni yo la
> conozco. Es la que cifra los datos de las personas que escriben al chat.
> **Si la pierdes, esos datos se pierden con ella.** Guárdala donde guardas
> las cosas importantes.

---

## Paso 4 · Pegarlas en Cloudflare

1. **https://dash.cloudflare.com** → Workers & Pages → `chatbot-multimarca`
2. **Ajustes** → baja a **Variables y secretos** → botón **Agregar**
3. Por cada una: Tipo **Secret**, nombre exacto, valor pegado.

Los cuatro nombres, tal cual (mayúsculas, guiones bajos, sin espacios):

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
CHATBOT_CLAVE
```

---

## Paso 5 · Redesplegar  ← el que se olvida

**Guardar las variables NO las activa.** Cloudflare las mete al construir.

Pestaña **Despliegues** → el primero de la lista → menú `⋯` →
**Retry deployment**. Tarda menos de un minuto.

---

## Paso 6 · Comprobar

En la Terminal:

```bash
curl -s 'https://chatbot-multimarca.pages.dev/api/bot?ping=1'
```

Busca `"base":true` y `"cifrado":true`. Si algo sigue en `false`, la misma
respuesta te dice cuál falta y qué hacer.

---

## Paso 7 · Hacerte superadministrador

Una sola vez, después de crear tu cuenta en el panel:

1. **https://supabase.com/dashboard/project/gnhndbqbgvtoxhelikcy/sql/new**
2. Pega esto y dale **Run**:

```sql
update usuarios
   set rol = 'superadmin', activo = true
 where email = 'doc.fiag93@gmail.com';
```

Debe decir que actualizó 1 fila. Con eso aparece la pestaña **Superusuario**.
