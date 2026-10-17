# Pendientes

Lo que falta, en el orden en que conviene hacerlo. Cada punto dice **qué**, **cómo** y **por qué en ese orden**.

## Resuelto

| Pendiente | Cómo se resolvió |
|---|---|
| Interfaz para usuario final | 5 herramientas en pestañas, con la identidad visual de la marca, claro/oscuro |
| Ver las páginas antes de combinar | Miniaturas con pdf.js; arrastrar para reordenar, botones ←/→, girar y quitar |
| Extraer y dividir páginas | `splitPdf` + `parseRanges` (`1-3, 5`); varios resultados se descargan en .zip |
| Office → PDF sin Docker en Windows | El servidor busca `soffice` en el PATH y en `C:\Program Files\LibreOffice`, o en `PDF_TOOLKIT_SOFFICE_CMD` |

## Pendiente

| # | Pendiente | Prioridad | Esfuerzo | Dónde corre |
|---|---|---|---|---|
| 1 | Numerar páginas | 🟠 Alta | Bajo (2–3 h) | Navegador (pdf-lib) |
| 2 | Marca de agua de texto | 🟠 Alta | Bajo (2–3 h) | Navegador (pdf-lib) |
| 3 | Comprimir PDF | 🟡 Media | Medio-alto | Navegador o servidor |
| 4 | Añadir texto encima (anotar, rellenar) | 🟡 Media | Medio (1–2 días) | Navegador (pdf-lib + pdf.js) |
| 5 | Editar texto existente en PDF | 🟢 Baja | Alto | Ver nota |
| 6 | Editar texto en imágenes | 🟢 Baja | Alto | Ver nota |

### 1–2. Numerar páginas y marca de agua

`page.drawText()` de pdf-lib con `StandardFonts.Helvetica`. Opciones mínimas: posición (abajo centro/derecha),
tamaño, formato (`1`, `1 / 10`); para la marca: texto, opacidad y rotación 45°. Reutiliza `PageGrid` para la
vista previa. Van primero porque son baratas, 100% en navegador y muy pedidas.

### 3. Comprimir PDF

pdf-lib **no** recomprime imágenes; un "comprimir" honesto requiere rasterizar o recodificar las imágenes.
Dos caminos:

- **Navegador:** extraer imágenes, recodificarlas a JPEG con canvas a menor calidad/resolución y reinsertarlas.
  Complejo con pdf-lib (hay que recorrer los XObjects a mano).
- **Servidor:** Ghostscript (`-dPDFSETTINGS=/ebook`). Simple y muy efectivo, pero Ghostscript es **AGPL**: solo
  como proceso externo opcional que instala el usuario, nunca empaquetado. Documentarlo en THIRD_PARTY_NOTICES.

Medir antes de prometer: en PDFs de solo texto la ganancia es casi nula.

### 4. Añadir texto encima

Lo que la mayoría de usuarios llama "editar un PDF": escribir sobre él (rellenar un formulario impreso, poner una
fecha, firmar). Se hace con un lienzo sobre la miniatura (pdf.js a mayor escala), cajas de texto posicionables y,
al guardar, `drawText` en coordenadas PDF (ojo: el origen está abajo a la izquierda y hay que considerar la rotación).

### 5. Editar texto existente — por qué va último

Un PDF no guarda párrafos sino glifos posicionados con fuentes que a menudo vienen recortadas (solo los caracteres
usados). Cambiar una palabra exige tener la fuente completa, recalcular posiciones y reescribir el content stream.
Las librerías que lo hacen bien son AGPL (PyMuPDF) o comerciales. Alternativa realista: **tapar y reescribir**
(rectángulo blanco + texto nuevo con una fuente parecida), que es lo que hacen la mayoría de herramientas gratuitas.
Implementarlo como variante del punto 4.

### 6. Editar texto en imágenes

Requiere OCR (detectar dónde está el texto), borrar con inpainting y volver a escribir. Necesitaría Tesseract y
OpenCV, que pdf-toolkit no usa. Fuera de alcance por ahora.

## No hacer todavía

- Cola de jobs en el servidor: es una herramienta local de un usuario; el semáforo basta.
- PDFs cifrados: pdf-lib no los abre; pedir contraseña añade complejidad para un caso poco frecuente.
