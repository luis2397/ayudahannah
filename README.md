# 🐾 Ayuda a Hannah

> Campaña de donación para los gastos veterinarios de Hannah, una perrita en estado delicado.

[![Deploy to GitHub Pages](https://github.com/luis2397/ayudahannah/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/luis2397/ayudahannah/actions/workflows/deploy-pages.yml)
[![CI](https://github.com/luis2397/ayudahannah/actions/workflows/ci.yml/badge.svg)](https://github.com/luis2397/ayudahannah/actions/workflows/ci.yml)

---

## 📌 Tabla de contenidos

1. [Arquitectura](#arquitectura)
2. [Frontend – GitHub Pages](#frontend--github-pages)
3. [Backend – Webhook Server](#backend--webhook-server)
4. [Configurar ePayco](#configurar-epayco)
5. [Desplegar el servidor webhook](#desplegar-el-servidor-webhook)
6. [Crear secretos en GitHub](#crear-secretos-en-github)
7. [Publicar GitHub Pages](#publicar-github-pages)
8. [Panel de administración](#panel-de-administración)
9. [Agregar actualizaciones y evidencias](#agregar-actualizaciones-y-evidencias)
10. [Estructura de archivos](#estructura-de-archivos)

---

## Arquitectura

```
┌─────────────────────┐        ┌──────────────────────────────────┐
│  Donante             │        │  GitHub Pages                    │
│  (navegador)         │◄──────►│  index.html + CSS/JS             │
└────────┬────────────┘        │  lee data/*.json en tiempo real  │
         │ pago                 └──────────────────────────────────┘
         ▼                               ▲  commits via API
┌─────────────────────┐        ┌─────────────────────────────────┐
│  ePayco              │        │  Webhook Server (Node/Express)  │
│  Smart Checkout      │───────►│  /webhooks/epayco               │
└─────────────────────┘        │  /admin/*                       │
         confirmación           └─────────────────────────────────┘
         (server-to-server)
```

- **Frontend**: HTML/CSS/JS estático hospedado en GitHub Pages. Lee `data/summary.json` para la barra de progreso.
- **Backend**: Servidor Express (`/server`) con endpoint webhook. Valida la firma de ePayco, actualiza `data/donations.json` y `data/summary.json` directamente vía GitHub API.
- **Datos**: Los archivos `data/*.json` son la fuente de verdad y se actualizan con cada donación aprobada.

---

## Frontend – GitHub Pages

El sitio es completamente estático y no requiere build:

- `index.html` – Página principal con historia, progreso, formulario de donación, actualizaciones, evidencias, FAQ y transparencia.
- `admin.html` – Panel de administración (protegido por token).
- `js/main.js` – Carga datos dinámicamente de `data/*.json`.

### Personalizar el sitio

Edita `index.html` y reemplaza los siguientes placeholders:

| Placeholder | Qué reemplazar |
|---|---|
| `window.EPAYCO_PUBLIC_KEY = 'TU_PUBLIC_KEY_AQUI'` | Tu llave pública de ePayco |
| `window.EPAYCO_TEST_MODE = true` | Cambiar a `false` en producción |
| `window.EPAYCO_CONFIRMATION_URL` | URL pública de tu webhook |
| `3XX-XXX-XXXX` (×2) | Tu número de Nequi y Daviplata |
| `[Nombre del diagnóstico veterinario]` | El diagnóstico de Hannah |
| Foto de Hannah | Sube `assets/hannah.jpg` y descomenta la etiqueta `<img>` |

---

## Backend – Webhook Server

### Requisitos

- Node.js >= 18
- npm

### Instalación local

```bash
cd server
npm install
cp .env.example .env
# Edita .env con tus valores reales
npm run dev   # desarrollo
npm start     # producción
```

### Variables de entorno

Crea el archivo `server/.env` basándote en `server/.env.example`:

```env
EPAYCO_CUSTOMER_ID=123456        # P_CUST_ID_CLIENTE de tu cuenta ePayco
EPAYCO_P_KEY=tu_llave_privada    # P_KEY de ePayco
WEBHOOK_SECRET=secreto_random    # Genera con: openssl rand -hex 32
GITHUB_PAT=ghp_xxxxxxxxxxxx      # PAT con scope "repo"
GITHUB_OWNER=luis2397
GITHUB_REPO=ayudahannah
GITHUB_BRANCH=main
ADMIN_TOKEN=otro_secreto_random  # Para acceder al panel admin
PORT=3000
CAMPAIGN_GOAL=3000000
```

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST/GET` | `/webhooks/epayco` | Webhook de confirmación de ePayco |
| `POST` | `/admin/confirm` | Confirmar donación pendiente (requiere `x-admin-token`) |
| `POST` | `/admin/manual-donation` | Registrar donación Nequi/Daviplata (requiere `x-admin-token`) |

---

## Configurar ePayco

1. Ingresa a tu [dashboard de ePayco](https://dashboard.epayco.co).
2. Ve a **Integración → Configuración de pagos**.
3. Configura:
   - **URL de respuesta** (redirige al usuario después del pago):
     ```
     https://TU_USUARIO.github.io/ayudahannah/
     ```
   - **URL de confirmación** (server-to-server, POST):
     ```
     https://tu-servidor.com/webhooks/epayco
     ```
4. Copia tu **P_CUST_ID_CLIENTE** (numérico) y **P_KEY** (llave privada).
5. Para pruebas activa el modo **sandbox/test** en ePayco y en `index.html` (`EPAYCO_TEST_MODE = true`).

### Flujo del webhook

```
ePayco → POST /webhooks/epayco
  ↓
Validar firma MD5(customer_id + p_key + ref_payco + tx_id + amount + currency)
  ↓
Verificar idempotencia (¿ya existe este transaction_id?)
  ↓
Si approved → GitHub API commit → data/donations.json + data/summary.json
  ↓
Responder HTTP 200 a ePayco
```

---

## Desplegar el servidor webhook

### Opción 1: Render (recomendado – gratis)

1. Crea cuenta en [render.com](https://render.com).
2. **New → Web Service → Connect repository** (o usa Deploy from Docker).
3. Configura:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: añade todas las variables de `.env.example`
4. Render te da una URL HTTPS como `https://ayudahannah.onrender.com`.
5. Esa URL va en `EPAYCO_CONFIRMATION_URL` y en `admin.html`.

### Opción 2: Railway

```bash
# Instalar Railway CLI
npm i -g @railway/cli
railway login
railway init
railway up
```

### Opción 3: Fly.io

```bash
cd server
fly launch
fly secrets set EPAYCO_CUSTOMER_ID=xxx EPAYCO_P_KEY=xxx ...
fly deploy
```

### Opción 4: Cloudflare Workers (sin servidor persistente)

> Requiere adaptar `server/src/index.js` a la API de Workers (sin Express).
> Documentación: https://developers.cloudflare.com/workers/

---

## Crear secretos en GitHub

### PAT (Personal Access Token) para el webhook

El webhook necesita un token con permisos para hacer commits al repo:

1. Ve a **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. Genera un nuevo token con scope `repo` (acceso completo al repositorio).
3. Copia el token.
4. En el servidor, agrégalo como variable de entorno `GITHUB_PAT`.

> ⚠️ **Importante**: El `GITHUB_TOKEN` que usan las GitHub Actions **NO** puede ser usado desde un servidor externo. Debes usar un PAT o una GitHub App.

### Secretos en GitHub Actions (para CI)

Ve a **Repository → Settings → Secrets and variables → Actions** y crea:

| Secreto | Valor |
|---|---|
| `EPAYCO_CUSTOMER_ID` | Tu P_CUST_ID_CLIENTE |
| `EPAYCO_P_KEY` | Tu P_KEY privada |
| `WEBHOOK_SECRET` | Tu secreto compartido |
| `GITHUB_PAT` | Tu PAT (si lo necesitas en Actions) |
| `ADMIN_TOKEN` | Token de administración |

---

## Publicar GitHub Pages

1. En el repositorio, ve a **Settings → Pages**.
2. En **Source**, selecciona **GitHub Actions**.
3. Haz un push a `main`. El workflow `deploy-pages.yml` se ejecutará automáticamente.
4. Tu sitio estará disponible en: `https://luis2397.github.io/ayudahannah/`

---

## Panel de administración

Accede a `https://luis2397.github.io/ayudahannah/admin.html`

- Ingresa tu `ADMIN_TOKEN` en la pantalla de login.
- También puedes pasar el token por URL: `admin.html?token=TU_TOKEN` (útil para bookmarks).
- Desde el panel puedes:
  - Ver todas las donaciones registradas.
  - Confirmar donaciones manuales de Nequi/Daviplata.
  - Registrar nuevas donaciones manuales.

> **Seguridad**: El panel solo es tan seguro como tu `ADMIN_TOKEN`. Usa un token de al menos 32 caracteres aleatorios. La validación real ocurre en el servidor.

---

## Agregar actualizaciones y evidencias

### Actualizaciones (timeline)

Edita `data/updates.json`:

```json
{
  "updates": [
    {
      "id": 2,
      "date": "2026-05-01",
      "title": "Primera consulta completada 🏥",
      "content": "Hannah tuvo su primera consulta de seguimiento y los resultados son alentadores.",
      "type": "success"
    }
  ]
}
```

Tipos disponibles: `info`, `success`, `warning`.

### Evidencias

Edita `data/evidences.json`:

```json
{
  "evidences": [
    {
      "id": 4,
      "title": "Factura veterinaria",
      "description": "Factura de la primera consulta.",
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
│   ├── summary.json        # ← Actualizado por el webhook automáticamente
│   ├── donations.json      # ← Actualizado por el webhook automáticamente
│   ├── updates.json        # Editar manualmente para agregar noticias
│   └── evidences.json      # Editar manualmente para agregar docs/fotos
├── server/
│   ├── src/index.js        # Express app + rutas
│   ├── src/webhook.js      # Validación ePayco
│   ├── src/github.js       # GitHub API helpers
│   ├── tests/              # Pruebas automáticas
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
└── .github/
    ├── workflows/
    │   ├── deploy-pages.yml
    │   ├── ci.yml
    │   └── rebuild.yml
    └── copilot-instructions.md
```

---

## Licencia

MIT – Úsalo libremente para ayudar a Hannah y a otras campañas solidarias. 🐾
