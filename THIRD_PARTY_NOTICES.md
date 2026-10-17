# Third-party notices

**Estado: borrador. Verificar cada licencia en su repositorio oficial antes de publicar o distribuir imágenes.**

| Componente | Uso | Licencia (a verificar) | Cómo se usa |
|---|---|---|---|
| pdf-lib | Operaciones de PDF en navegador | MIT | Dependencia frontend |
| pdf.js (pdfjs-dist) | Miniaturas de páginas | Apache-2.0 | Dependencia frontend |
| fflate | Descargar varios archivos en .zip | MIT | Dependencia frontend |
| Bricolage Grotesque, Instrument Sans, JetBrains Mono (@fontsource) | Tipografías de la interfaz | OFL-1.1 | Empaquetadas con el frontend |
| React, Vite | Frontend | MIT | Dependencia frontend |
| FastAPI, Uvicorn, pydantic-settings | Servidor opcional | MIT / BSD | Dependencia Python |
| LibreOffice | Office→PDF | MPL-2.0 | Proceso externo en la imagen Docker |
| Fuentes Carlito, Caladea, Liberation | Fidelidad de Office→PDF | OFL / OFL / OFL | Incluidas en la imagen Docker |

## Evitados deliberadamente (el repo es MIT)

- **PyMuPDF**: AGPL (o licencia comercial). Incompatible con mantener el proyecto bajo MIT.

Si distribuyes la imagen Docker, respeta los avisos de LibreOffice y de las fuentes incluidas.
