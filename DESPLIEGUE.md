# Subirlo a Cloudflare Pages

## Qué es este proyecto

Un producto **aparte**. No comparte repositorio, ni base de datos, ni
hospedaje con la app médica. Esa fue una decisión explícita: la integración
con el resto del ecosistema queda para el final, cuando los demás productos
estén terminados. Mientras tanto, nada de aquí puede tocar los datos de los
pacientes, ni por accidente ni por un error de configuración.

## La estructura, y por qué está así

```
chatbot/                    ← la raíz del repo
├── publico/                ← ESTO es lo único que se publica
│   ├── index.html          consola: pruebas, panel, herramientas
│   ├── widget.js           la burbuja que se incrusta en los sitios
│   ├── cerebro/            módulos compartidos cliente + servidor
│   ├── _headers            cabeceras y caché
│   └── _routes.json        qué rutas despiertan una función
├── functions/api/          las funciones de Cloudflare (2 archivos chicos)
├── servidor/               la lógica del bot y del panel — NO se publica
├── db/                     el esquema de Supabase
└── pruebas/
```

`servidor/` vive fuera de `publico/` a propósito: es código de servidor y no
tiene por qué poder descargarse. Las llaves nunca están en archivos —siempre
en variables de entorno— pero aun así, publicar lo que no hace falta es
regalar información.

## Los pasos

### 1. Crear el repositorio en GitHub

En [github.com/new](https://github.com/new):

- **Nombre:** `chatbot-multimarca`
- **Visibilidad: Private.** Aquí va la lógica de un producto que vas a
  vender. Que sea privado no es paranoia, es lo normal.
- **No** marques "Add a README" — el proyecto ya tiene uno y chocarían.

### 2. Subirlo

Desde `~/Desktop/CLAUDE/chatbot` (cambia el usuario si tu cuenta de GitHub
es otra):

```bash
git remote add origin https://github.com/docfiag93-gif/chatbot-multimarca.git && git branch -M main && git push -u origin main
```

### 3. Conectarlo en Cloudflare

Workers & Pages → Create → Pages → Connect to Git → `chatbot-multimarca`.

| Campo | Valor |
|---|---|
| Framework preset | None |
| Build command | *(déjalo vacío)* |
| Build output directory | `publico` |
| Root directory | *(déjalo vacío)* |

El comando de compilación va vacío porque no hay nada que compilar: son
archivos estáticos. Cloudflare encuentra `functions/` solo, en la raíz.

### 4. Las variables (Settings → Variables and Secrets)

Todas como **Secret**, no como texto plano:

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

### 5. Comprobar que quedó bien

1. `https://<tu-proyecto>.pages.dev/api/bot?ping=1` → debe contestar
   `base: true`, `cifrado: true` y los proveedores con llave.
2. La consola en `https://<tu-proyecto>.pages.dev/` → Herramientas →
   **Correr pruebas**. Si el cifrado pasa sus 10 casos, quedó bien.
3. Regístrate en el panel y hazte superadmin una sola vez, en el editor SQL
   de Supabase:
   ```sql
   update usuarios set rol='superadmin', activo=true where email='doc.fiag93@gmail.com';
   ```

### 6. Verifica que quedó

`https://chatbot-multimarca.pages.dev/api/bot?ping=1` debe responder
`listo: true` y los proveedores con llave en `true`.

## Probarlo en local

```bash
python3 -m http.server 8792
```

Y abrir `http://127.0.0.1:8792/publico/index.html`. Se ve la consola y se
pueden afinar marcas y colores. Lo que **no** funciona en local son las
respuestas del bot ni el panel: necesitan las funciones desplegadas.

Las pruebas que sí corren sin desplegar nada:

```bash
python3 pruebas/probar_banderas.py
```
