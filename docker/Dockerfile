# syntax=docker/dockerfile:1
# Un contenedor: frontend estático + servidor opcional con LibreOffice para Office -> PDF.
# Si solo quieres las herramientas del navegador, no necesitas Docker: `cd web && npm run build` y sirve `dist/`.

FROM node:22-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/pyproject.toml ./pyproject.toml
COPY server/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./web_dist
RUN useradd -m appuser
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
