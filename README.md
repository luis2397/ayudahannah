# 🐾 Ayuda a Hannah

> Campaña de donación para los gastos veterinarios de Hannah, una perrita con Parvovirosis Canina que está luchando por su vida.

[![Deploy to GitHub Pages](https://github.com/luis2397/ayudahannah/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/luis2397/ayudahannah/actions/workflows/deploy-pages.yml)
[![CI](https://github.com/luis2397/ayudahannah/actions/workflows/ci.yml/badge.svg)](https://github.com/luis2397/ayudahannah/actions/workflows/ci.yml)

---

## 📌 Tabla de contenidos

1. [Arquitectura](#arquitectura)
2. [Paso 1 – Publicar GitHub Pages](#paso-1--publicar-github-pages)
3. [Paso 2 – Desplegar el servidor backend](#paso-2--desplegar-el-servidor-backend)
4. [Paso 3 – Crear el PAT de GitHub](#paso-3--crear-el-pat-de-github)
5. [Paso 4 – Configurar las variables de entorno del servidor](#paso-4--configurar-las-variables-de-entorno-del-servidor)
6. [Paso 5 – Conectar el frontend con el backend](#paso-5--conectar-el-frontend-con-el-backend)
7. [Panel de administración](#panel-de-administración)
8. [Desarrollo local](#desarrollo-local)
9. [Agregar actualizaciones y evidencias](#agregar-actualizaciones-y-evidencias)
10. [Estructura de archivos](#estructura-de-archivos)

---

## Arquitectura

```
┌──────────────────────────────────────┐
│  Donante (navegador)                 │
│  1. Transfiere por Nequi/Daviplata   │
│  2. Registra la donación en el form  │
└───────────────┬──────────────────────┘
                │ POST /donations/register
                ▼
┌──────────────────────────────────────┐
│  Servidor backend (Node/Express)     │
│  • Guarda donación como "pending"    │
│  • Commits a data/donations.json     │
│     vía GitHub API                   │
└───────────────┬──────────────────────┘
                │ GitHub API commit
                ▼
┌──────────────────────────────────────┐
│  GitHub Pages                        │
│  index.html + CSS/JS                 │
│  lee data/*.json en tiempo real      │
└──────────────────────────────────────┘

Tú (admin) confirmas el pago en el panel
→ POST /admin/confirm
→ El servidor actualiza el estado a "approved"
→ Se recalcula data/summary.json
→ La barra de progreso se actualiza sola
```

- **Frontend**: HTML/CSS/JS estático hospedado en GitHub Pages. Lee `data/summary.json` para la barra de progreso.
- **Backend**: Servidor Express (`/server`). Recibe registros de donación, hace commits a `data/donations.json` vía GitHub API y expone endpoints de administración.
- **Datos**: Los archivos `data/*.json` son la fuente de verdad y quedan versionados en el repositorio.

---

## Paso 1 – Publicar GitHub Pages

1. Ve al repositorio en GitHub → **Settings → Pages**.
2. En **Source**, selecciona **GitHub Actions**.
3. Haz un push a `main` (o usa el botón *Run workflow* en la pestaña **Actions → Deploy to GitHub Pages**).
4. En menos de un minuto tu sitio estará en:
   ```
   https://luis2397.github.io/ayudahannah/
   ```

> ✅ El sitio ya funciona sin el backend: la barra de progreso leerá `data/summary.json` directamente desde GitHub Pages.

---

## Paso 2 – Desplegar el servidor backend

El servidor es necesario para recibir los registros de donación del formulario y para el panel de administración.

### Opción A: Render (recomendado – plan gratuito)

1. Crea cuenta en [render.com](https://render.com).
2. **New → Web Service → Connect repository**.
3. Configura:
   | Campo | Valor |
   |---|---|
   | **Root Directory** | `server` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free |
4. Render te dará una URL como `https://ayudahannah.onrender.com`.  
   Guárdala, la necesitarás en el [Paso 5](#paso-5--conectar-el-frontend-con-el-backend).
5. Agrega las variables de entorno en la sección **Environment** de Render (ver [Paso 4](#paso-4--configurar-las-variables-de-entorno-del-servidor)).

### Opción B: Railway

```bash
npm i -g @railway/cli
railway login
cd server
railway init
railway up
```

Luego configura las variables de entorno desde el dashboard de Railway.

### Opción C: Fly.io

```bash
cd server
fly launch
fly secrets set GITHUB_PAT=xxx ADMIN_TOKEN=xxx GITHUB_OWNER=luis2397 GITHUB_REPO=ayudahannah
fly deploy
```

---

## Paso 3 – Crear el PAT de GitHub

El servidor necesita un token de GitHub para poder hacer commits a `data/donations.json` y `data/summary.json`.

1. Ve a **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. Haz clic en **Generate new token (classic)**.
3. Dale un nombre descriptivo (ej: `ayudahannah-server`).
4. Selecciona el scope **`repo`** (acceso completo al repositorio).
5. Haz clic en **Generate token** y copia el valor (empieza por `ghp_…`).

> ⚠️ El `GITHUB_TOKEN` automático de GitHub Actions **no sirve** para uso desde un servidor externo. Debes usar un PAT clásico o una GitHub App.

---

## Paso 4 – Configurar las variables de entorno del servidor

Crea el archivo `server/.env` copiando `server/.env.example` y rellena cada valor:

```env
# Token de GitHub generado en el Paso 3
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx

# Usuario/organización dueño del repositorio
GITHUB_OWNER=luis2397

# Nombre del repositorio
GITHUB_REPO=ayudahannah

# Rama donde se guardan los datos
GITHUB_BRANCH=main

# Token para el panel de administración (mínimo 32 caracteres)
# Genera uno con: openssl rand -hex 32
ADMIN_TOKEN=reemplaza_con_un_secreto_largo

# Origen permitido para CORS (URL de GitHub Pages en producción)
CORS_ORIGIN=https://luis2397.github.io

# Puerto del servidor (Render/Railway lo asignan automáticamente)
PORT=3000

# Meta de la campaña en COP
CAMPAIGN_GOAL=3000000
```

En **Render**, agrega estas mismas variables en **Environment → Add Environment Variable** (una por una o en bloque).

---

## Paso 5 – Conectar el frontend con el backend

Una vez que tengas la URL pública del servidor (ej: `https://ayudahannah.onrender.com`), edita `index.html`:

```html
<!-- línea ~18 -->
<script>
  window.DONATION_SERVER_URL = 'https://ayudahannah.onrender.com';
</script>
```

Haz commit y push a `main`. GitHub Pages se actualizará automáticamente.

---

## Panel de administración

Accede a: `https://luis2397.github.io/ayudahannah/admin.html`

1. Ingresa tu `ADMIN_TOKEN` en la pantalla de login.
2. También puedes guardar el enlace con token: `admin.html?token=TU_TOKEN`.
3. Desde el panel puedes:
   - Ver todas las donaciones registradas (pendientes y aprobadas).
   - **Confirmar** una donación pendiente cuando verifiques que el pago llegó a Nequi/Daviplata.

> **Flujo de confirmación**:  
> Donante transfiere → Registra en el formulario → Estado queda `pending` →  
> Tú revisas Nequi/Daviplata → Confirmas en el panel → Estado pasa a `approved` →  
> La barra de progreso se actualiza automáticamente.

---

## Desarrollo local

```bash
# Frontend – cualquier servidor estático
python3 -m http.server 8080
# Abre http://localhost:8080

# Backend
cd server
npm install
cp .env.example .env   # Rellena los valores en .env
npm run dev            # Modo watch (Node.js >= 18)
npm test               # Ejecutar pruebas
```

---

## Agregar actualizaciones y evidencias

### Actualizaciones (timeline)

Edita `data/updates.json` y haz commit a `main`:

```json
{
  "updates": [
    {
      "id": 2,
      "date": "2026-05-01",
      "title": "Hannah mejora 🐾",
      "content": "Los veterinarios reportan mejoría. ¡Gracias a todos por su apoyo!",
      "type": "success"
    }
  ]
}
```

Tipos disponibles: `info` | `success` | `warning`.

### Evidencias

Edita `data/evidences.json` y haz commit a `main`:

```json
{
  "evidences": [
    {
      "id": 1,
      "title": "Factura veterinaria",
      "description": "Factura de hospitalización – semana 1.",
      "type": "pdf",
      "url": "https://github.com/luis2397/ayudahannah/raw/main/assets/factura-001.pdf",
      "thumbnail": null
    }
  ]
}
```

---

## Estructura de archivos

```
ayudahannah/
├── index.html              # Página principal
├── admin.html              # Panel de admin
├── css/styles.css          # Estilos
├── js/main.js              # Lógica del frontend
├── data/
│   ├── summary.json        # ← Actualizado automáticamente al confirmar donaciones
│   ├── donations.json      # ← Actualizado automáticamente con cada registro/confirmación
│   ├── updates.json        # Editar manualmente para agregar noticias
│   └── evidences.json      # Editar manualmente para agregar docs/fotos
├── server/
│   ├── src/index.js        # Express app + rutas
│   ├── src/webhook.js      # Helpers de donación
│   ├── src/github.js       # GitHub API helpers
│   ├── tests/              # Pruebas automáticas
│   ├── package.json
│   ├── .env.example        # Plantilla de variables de entorno
│   └── Dockerfile
└── .github/
    ├── workflows/
    │   ├── deploy-pages.yml  # Deploy automático a GitHub Pages (push a main)
    │   ├── ci.yml            # Lint y pruebas del backend
    │   └── rebuild.yml       # Recalcular totales manualmente
    └── copilot-instructions.md
```

---

## Licencia

MIT – Úsalo libremente para ayudar a Hannah y a otras campañas solidarias. 🐾
