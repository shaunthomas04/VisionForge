# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ────────────────────────────────────────────────────
FROM python:3.11-slim

# Node.js is required so ADK can spawn `npx mongodb-mcp-server` as a subprocess.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Pre-install the MCP package so cold starts don't need to download it.
RUN npm install -g mongodb-mcp-server

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (agent/, server/, etc.)
COPY . .

# Overwrite with the freshly built frontend (takes precedence over any stale dist/)
COPY --from=frontend /build/dist ./frontend/dist

ENV PYTHONUNBUFFERED=1
# Allow all origins in production — frontend and backend share the same Cloud Run URL.
ENV ALLOWED_ORIGINS=*

# Cloud Run injects $PORT (default 8080).
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
