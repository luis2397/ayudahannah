# ─────────────────────────────────────────────────────────
#  Ayuda Hannah – Webhook Server Dockerfile
# ─────────────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies only when package.json changes
COPY package.json ./
RUN npm install --omit=dev

# Copy source code
COPY src/ ./src/

# ── Runtime user (non-root for security) ──
RUN addgroup -S hannah && adduser -S hannah -G hannah
USER hannah

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
