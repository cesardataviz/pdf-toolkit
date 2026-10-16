# pdf-toolkit

Herramientas de PDF e imágenes que corren **en tu navegador**: combinar, reordenar, rotar y eliminar páginas,
imágenes a PDF y conversión entre JPG/PNG/WebP. **Tus archivos no se suben a ningún servidor.**

> Estado: en desarrollo. Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Qué hace y dónde corre

| Herramienta | Dónde |
|---|---|
| Combinar, reordenar, rotar, eliminar páginas | Navegador |
| Imágenes (JPG, PNG, WebP...) → PDF | Navegador |
| Convertir imágenes (WebP → JPG, PNG → JPG, etc.) | Navegador |
| Word / Excel / PowerPoint → PDF | Servidor local opcional (LibreOffice) |

## Uso

**Solo navegador** (sin Office → PDF):

```bash
cd web
npm install
npm run dev          # o: npm run build y sirve dist/ con cualquier servidor estático
```

**Completo, con Office → PDF** (Docker):

```bash
docker compose up --build
```

Abre http://127.0.0.1:8000.

## Desarrollo

```bash
cd web && npm install && npm test                 # tests de las operaciones de PDF
cd server && pip install -e ".[dev]" && pytest    # tests del servidor
```

## Proyecto hermano

[files2md](https://github.com/) — convierte PDFs, imágenes y documentos a Markdown/Word/PDF ordenado con OCR local.

## Licencia

[MIT](LICENSE). Ver `THIRD_PARTY_NOTICES.md`.
