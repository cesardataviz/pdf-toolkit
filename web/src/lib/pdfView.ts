// Visor para el editor: abre el PDF una vez con pdf.js y dibuja cada página a demanda, a la resolución
// de la pantalla. El canvas es solo la vista: el PDF que se guarda nunca pasa por aquí.
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ViewPage {
  width: number; // puntos PDF, tal como se ve (con /Rotate aplicado)
  height: number;
}

export async function openPdf(buffer: ArrayBuffer): Promise<{ doc: PDFDocumentProxy; pages: ViewPage[] }> {
  // pdf.js transfiere el buffer a su worker: se le pasa una copia.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const pages: ViewPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height });
  }
  return { doc, pages };
}

/** Dibuja la página en el canvas a `zoom` CSS px por punto. Devuelve una función para cancelar. */
export function renderPage(doc: PDFDocumentProxy, index: number, canvas: HTMLCanvasElement, zoom: number): () => void {
  let task: RenderTask | null = null;
  let cancelled = false;
  (async () => {
    const page = await doc.getPage(index + 1);
    if (cancelled) return;
    // Nitidez: resolución física de la pantalla, con tope para no gastar memoria en zooms grandes.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(zoom * dpr, 6);
    const vp = page.getViewport({ scale });
    const off = document.createElement("canvas"); // se dibuja fuera y se copia: sin parpadeo al hacer zoom
    off.width = Math.ceil(vp.width);
    off.height = Math.ceil(vp.height);
    const ctx = off.getContext("2d");
    if (!ctx) return;
    task = page.render({ canvasContext: ctx, viewport: vp });
    try {
      await task.promise;
    } catch {
      return; // cancelado
    }
    if (cancelled) return;
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext("2d")?.drawImage(off, 0, 0);
  })();
  return () => {
    cancelled = true;
    task?.cancel();
  };
}

/** Libera la memoria del canvas de una página que salió de la vista. */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
