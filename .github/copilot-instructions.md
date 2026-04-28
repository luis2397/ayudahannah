# Copilot Instructions – Ayuda Hannah

## Estructura del repositorio

```
ayudahannah/
├── index.html              # Página pública principal (GitHub Pages)
├── admin.html              # Panel de administración (protegido por token)
├── css/
│   └── styles.css          # Estilos de la campaña
├── js/
│   └── main.js             # Lógica del frontend: progreso, updates, evidencias
├── data/
│   ├── summary.json        # Total recaudado, meta, porcentaje (actualizado por webhook)
│   ├── donations.json      # Registro de donaciones aprobadas (sin datos sensibles)
│   ├── updates.json        # Timeline de actualizaciones (editar manualmente)
│   └── evidences.json      # Evidencias (links a PDFs/imágenes)
├── server/
│   ├── src/
│   │   ├── index.js        # Servidor Express principal
│   │   ├── webhook.js      # Lógica de validación del webhook de ePayco
│   │   └── github.js       # Integración con GitHub API para commits
│   ├── tests/
│   │   └── webhook.test.js # Pruebas con Node.js built-in test runner
│   ├── package.json
│   ├── .env.example        # Variables de entorno requeridas
│   └── Dockerfile
├── .github/
│   ├── workflows/
│   │   ├── deploy-pages.yml  # Deploy automático a GitHub Pages
│   │   ├── ci.yml            # Lint y pruebas del backend
│   │   └── rebuild.yml       # Workflow manual para recalcular totales
│   └── copilot-instructions.md
└── README.md
```

## Comandos útiles

### Frontend
- El frontend es estático (HTML/CSS/JS). No requiere build.
- Para probar localmente: `python3 -m http.server 8080` (o cualquier servidor estático)
- Se despliega automáticamente a GitHub Pages en cada push a `main` vía `.github/workflows/deploy-pages.yml`

### Backend (server/)
```bash
cd server
npm install          # Instalar dependencias
cp .env.example .env # Crear archivo de entorno
npm run dev          # Iniciar en modo desarrollo (Node.js --watch)
npm start            # Iniciar en producción
npm test             # Ejecutar pruebas (requiere Node >= 18)
```

### Docker
```bash
cd server
docker build -t ayudahannah-server .
docker run -p 3000:3000 --env-file .env ayudahannah-server
```

## Reglas de contribución

### Datos
- **NUNCA** guardar datos personales sensibles (nombre completo, email, CC, datos de tarjeta).
- Solo guardar en `data/donations.json`: `transaction_id`, `date`, `amount`, `currency`, `status`, `method`, `approval_code`.
- Los archivos `data/*.json` son la fuente de verdad y deben ser legibles públicamente.

### Seguridad
- Toda lógica de validación de firmas está en `server/src/webhook.js`.
- El `ADMIN_TOKEN` y el `GITHUB_PAT` NUNCA deben aparecer en código fuente o logs.
- La página `/admin.html` es solo un frontend; la seguridad real está en el servidor.
- Usar siempre `crypto.timingSafeEqual()` para comparar tokens/firmas.

### Webhook
- El endpoint `POST /webhooks/epayco` debe ser **idempotente**: si llega el mismo `x_transaction_id` dos veces, el segundo se ignora.
- Solo se persisten donaciones con `status: 'approved'` o `status: 'manual'`.
- Siempre devolver HTTP 200 a ePayco para evitar reintentos por errores en nuestra infraestructura.

### Actualizaciones editoriales
Para agregar una actualización de campaña:
1. Editar `data/updates.json` y agregar un objeto con: `id`, `date` (YYYY-MM-DD), `title`, `content`, `type` (`info`|`success`|`warning`).
2. Hacer commit a `main`. El frontend lee este archivo en tiempo real.

### Evidencias
Para agregar evidencias:
1. Subir el archivo (PDF o imagen) al repositorio o a un hosting externo.
2. Editar `data/evidences.json` y agregar la URL.
3. Hacer commit a `main`.

## Variables de entorno requeridas (servidor)

| Variable | Descripción |
|---|---|
| `EPAYCO_CUSTOMER_ID` | P_CUST_ID_CLIENTE de ePayco |
| `EPAYCO_P_KEY` | P_KEY (llave privada) de ePayco |
| `WEBHOOK_SECRET` | Secreto compartido para validación adicional |
| `GITHUB_PAT` | Personal Access Token con scope `repo` |
| `GITHUB_OWNER` | Usuario/organización del repo |
| `GITHUB_REPO` | Nombre del repositorio |
| `GITHUB_BRANCH` | Rama destino para commits (default: `main`) |
| `ADMIN_TOKEN` | Token para acceder a `/admin/*` endpoints |
| `PORT` | Puerto del servidor (default: 3000) |
| `CAMPAIGN_GOAL` | Meta de la campaña en COP (default: 3000000) |

## Placeholders a reemplazar antes del deploy

En `index.html`:
- `window.EPAYCO_PUBLIC_KEY` → tu llave pública de ePayco
- `window.EPAYCO_CONFIRMATION_URL` → URL pública de tu webhook
- Número de Nequi/Daviplata (buscar `3XX-XXX-XXXX`)
- Foto de Hannah: descomenta `<img src="./assets/hannah.jpg">`
- Diagnóstico: reemplaza `[Nombre del diagnóstico veterinario]`

En `admin.html`:
- `window.WEBHOOK_SERVER_URL` → URL de tu servidor desplegado
