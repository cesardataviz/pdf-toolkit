// Operaciones de PDF 100% en el navegador: el archivo nunca sale de la máquina del usuario.
import { PDFDocument, degrees } from "pdf-lib";

export interface PageRef {
  source: number; // índice del archivo de entrada
  index: number; // página dentro de ese archivo (base 0)
  rotate: number; // rotación adicional: 0 | 90 | 180 | 270
}

/**
 * Primitiva única: construye un PDF nuevo con las páginas indicadas, en ese orden.
 * Combinar, reordenar, extraer, eliminar y rotar son casos particulares de esta función.
 */
export async function buildPdf(sources: ArrayBuffer[], pages: PageRef[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("No hay páginas para generar el PDF");
  const docs = await Promise.all(sources.map((b) => PDFDocument.load(b)));
  const out = await PDFDocument.create();
  for (const ref of pages) {
    const doc = docs[ref.source];
    if (!doc || ref.index < 0 || ref.index >= doc.getPageCount()) {
      throw new Error(`Página fuera de rango: archivo ${ref.source}, página ${ref.index}`);
    }
    const [page] = await out.copyPages(doc, [ref.index]);
    const rotation = (page.getRotation().angle + ref.rotate) % 360;
    if (rotation !== page.getRotation().angle) page.setRotation(degrees(rotation));
    out.addPage(page);
  }
  return out.save();
}

/** Lista todas las páginas de varios PDFs, en orden, lista para reordenar en la UI. */
export async function listPages(sources: ArrayBuffer[]): Promise<PageRef[]> {
  const counts = await Promise.all(sources.map(async (b) => (await PDFDocument.load(b)).getPageCount()));
  return counts.flatMap((n, source) => Array.from({ length: n }, (_, index) => ({ source, index, rotate: 0 })));
}

/** Imágenes JPG/PNG (ya normalizadas) a un PDF, una por página, a su tamaño original. */
export async function imagesToPdf(images: { bytes: ArrayBuffer; type: "jpg" | "png" }[]): Promise<Uint8Array> {
  if (images.length === 0) throw new Error("No hay imágenes");
  const out = await PDFDocument.create();
  for (const img of images) {
    // embedJpg incrusta el JPEG tal cual, sin recomprimir.
    const embedded = img.type === "jpg" ? await out.embedJpg(img.bytes) : await out.embedPng(img.bytes);
    const page = out.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  return out.save();
}

/** Un PDF por grupo de páginas (índices base 0). Sirve para dividir o extraer. */
export async function splitPdf(source: ArrayBuffer, groups: number[][]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const group of groups) {
    out.push(await buildPdf([source], group.map((index) => ({ source: 0, index, rotate: 0 }))));
  }
  return out;
}
