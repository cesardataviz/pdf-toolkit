# Arquitectura

## Componentes

Todo ocurre en el navegador salvo Office → PDF, que pasa por el servidor local opcional.

```mermaid
flowchart LR
    user([Usuario])

    subgraph browser["Navegador · los archivos no salen de aquí"]
        ui["App.tsx<br/>interfaz de herramientas"]
        pdfops["lib/pdfOps.ts<br/>pdf-lib: buildPdf · imagesToPdf"]
        images["lib/images.ts<br/>canvas: convertImage"]
        office["lib/office.ts<br/>cliente HTTP"]
    end

    subgraph server["Servidor local opcional · Docker"]
        api["FastAPI<br/>POST /api/office-to-pdf"]
        lo["LibreOffice headless<br/>perfil aislado + timeout"]
        tmp[("Directorio temporal<br/>se borra al responder")]
    end

    user --> ui
    ui --> pdfops
    ui --> images
    images -- "WebP/BMP → PNG" --> pdfops
    ui --> office
    office -- "solo Word/Excel/PPT" --> api
    api --> tmp
    api --> lo
    lo --> tmp
```

## Flujo de una operación

```mermaid
sequenceDiagram
    actor U as Usuario
    participant UI as Navegador
    participant P as pdfOps (pdf-lib)
    participant S as Servidor (FastAPI)
    participant L as LibreOffice

    Note over U,P: Combinar / reordenar / rotar: 100% local
    U->>UI: Selecciona uno o varios PDFs
    UI->>P: listPages(buffers)
    P-->>UI: PageRef[] (una por página)
    U->>UI: Reordena, rota o elimina páginas
    UI->>P: buildPdf(buffers, pages)
    P-->>UI: PDF nuevo en memoria
    UI-->>U: Descarga resultado.pdf

    Note over U,L: Office → PDF: único paso que usa servidor
    U->>UI: Selecciona un .docx
    UI->>S: POST /api/office-to-pdf
    S->>S: Valida extensión, tamaño y token
    S->>L: soffice --convert-to pdf (con timeout)
    L-->>S: Archivo .pdf
    S-->>UI: PDF y borra el temporal
    UI-->>U: Descarga documento.pdf
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
