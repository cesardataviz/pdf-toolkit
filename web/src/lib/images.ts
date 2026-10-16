// Conversión de imágenes en el navegador con canvas. Sin servidor.

export type ImageTarget = "jpg" | "png" | "webp";

const MIME: Record<ImageTarget, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("El navegador no pudo leer la imagen (formato no soportado o archivo dañado)");
  }
}

/**
 * Convierte una imagen a jpg/png/webp.
 * JPG no tiene canal alfa: se compone sobre fondo blanco para que lo transparente no quede negro.
 */
export async function convertImage(file: Blob, target: ImageTarget, quality = 0.92): Promise<Blob> {
  const bmp = await decode(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  if (target === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, MIME[target], quality));
  if (!blob) throw new Error(`El navegador no puede codificar ${target}`);
  return blob;
}

/** Normaliza cualquier imagen a algo que pdf-lib pueda incrustar (JPG o PNG). */
export async function toEmbeddable(file: File): Promise<{ bytes: ArrayBuffer; type: "jpg" | "png" }> {
  const t = file.type;
  if (t === "image/jpeg") return { bytes: await file.arrayBuffer(), type: "jpg" }; // sin recomprimir
  if (t === "image/png") return { bytes: await file.arrayBuffer(), type: "png" };
  // webp, bmp, gif...: a PNG para no perder calidad ni transparencia.
  return { bytes: await (await convertImage(file, "png")).arrayBuffer(), type: "png" };
}
