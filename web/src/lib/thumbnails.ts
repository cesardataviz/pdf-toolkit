// Miniaturas de páginas con pdf.js, en el navegador (el archivo no sale de la computadora).
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderThumbnails(
  buffer: ArrayBuffer,
  width = 180,
  onPage?: (index: number, dataUrl: string) => void,
): Promise<string[]> {
  // pdf.js se queda con el buffer (lo transfiere al worker): se le pasa una copia.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  const thumbs: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.82);
      thumbs.push(url);
      onPage?.(n - 1, url);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return thumbs;
}
