# Arquitectura

```
Navegador (Vite + React)
 ├─ lib/pdfOps.ts   pdf-lib: buildPdf (combinar/reordenar/rotar/eliminar), imagesToPdf
 ├─ lib/images.ts   canvas: convertImage (jpg/png/webp), normalización para PDF
 └─ lib/office.ts   ──HTTP──►  server/ (FastAPI, opcional)
                                └─ POST /api/office-to-pdf → LibreOffice headless → PDF
                                   (también sirve el frontend compilado)
```

## Principios

1. **Cliente primero.** Todo lo que se puede hacer en el navegador se hace allí: privacidad real, costo de servidor
   cero y se puede publicar como web estática.
2. **Una primitiva para páginas.** `buildPdf(sources, pages)` cubre combinar, reordenar, extraer, eliminar y rotar.
   La UI solo manipula la lista `PageRef[]`.
3. **Servidor mínimo y opcional.** Solo para Office → PDF. Endpoint síncrono con semáforo de concurrencia (no cola
   de jobs): es una herramienta local de un usuario. Si se expone a muchos usuarios, migrar al patrón de jobs de files2md.
4. **Nada queda en disco.** El servidor convierte en un directorio temporal que se borra tras enviar la respuesta.

## Decisiones técnicas

- **JPG → PDF sin recomprimir:** `embedJpg` incrusta el JPEG original.
- **WebP y otros → PDF:** se normalizan a PNG con canvas (pdf-lib solo incrusta JPG/PNG).
- **Transparencia → JPG:** se compone sobre fondo blanco; si no, queda negro.
- **LibreOffice:** perfil de usuario aislado por conversión (no tolera perfiles compartidos en paralelo), timeout
  duro, fuentes Carlito/Caladea para aproximar Calibri/Cambria. La fidelidad no es perfecta.

## Estado

| Pieza | Estado |
|---|---|
| `buildPdf`, `listPages` | Implementado y con tests |
| `imagesToPdf`, `convertImage` | Implementado, sin tests automáticos (dependen de canvas del navegador) |
| Servidor Office → PDF | Implementado, probado con LibreOffice simulado; **sin probar con LibreOffice real** |
| UI | Básica: lista con subir/bajar/rotar/eliminar. Pendiente miniaturas (pdf.js) y arrastrar |
| Editar texto en PDF/imágenes | No iniciado. Alcance previsto: reemplazar texto en una región seleccionada |
| Comprimir PDF, dividir por rangos, marcas de agua | No iniciado |

## Límites conocidos

- PDFs cifrados: pdf-lib no los abre sin contraseña.
- PDFs muy grandes (cientos de MB) pueden agotar la memoria de la pestaña.
