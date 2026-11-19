// Editor: añade texto, imágenes, firmas y rectángulos ENCIMA de un PDF existente, en el navegador.
//
// Por qué no distorsiona: no se rasteriza ni se reescribe nada del original. pdf-lib carga el documento,
// agrega un content stream nuevo al final de cada página tocada (envolviendo el original en q/Q para que su
// estado gráfico no afecte lo nuevo) y guarda. El texto original sigue siendo texto, los vectores siguen
// siendo vectores, y las fuentes estándar (Helvetica, Times, Courier) no se incrustan: el archivo casi no crece.
import { BlendMode, LineCapStyle, PDFDocument, PDFFont, PDFImage, StandardFonts, degrees, rgb } from "pdf-lib";

export type FontFamily = "helvetica" | "times" | "courier";

interface Base {
  id: string;
  page: number; // índice base 0
  // Posición y tamaño en puntos PDF, medidos sobre la página TAL COMO SE VE (origen arriba a la izquierda,
  // ya aplicada la rotación /Rotate). La conversión a coordenadas internas del PDF se hace al guardar.
  x: number;
  y: number;
}

export interface TextEdit extends Base {
  kind: "text";
  text: string;
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  color: string; // #rrggbb
  /** Distancia del borde superior de cada línea a su línea base, en em (medida en el navegador para WYSIWYG). */
  baseline: number;
}

export interface ImageEdit extends Base {
  kind: "image";
  w: number;
  h: number;
  imageId: string;
}

/** Trazo vectorial: firma dibujada o lápiz libre. `d` es un path SVG en el sistema de vbW × vbH. */
export interface PathEdit extends Base {
  kind: "path";
  w: number;
  h: number;
  d: string;
  vbW: number;
  vbH: number;
  stroke: number; // grosor en unidades del viewBox
  color: string;
}

/** Rectángulo: tapar (blanco opaco) o resaltar (color translúcido en modo multiplicar). */
export interface RectEdit extends Base {
  kind: "rect";
  w: number;
  h: number;
  color: string;
  opacity: number;
  multiply: boolean;
}

export type Edit = TextEdit | ImageEdit | PathEdit | RectEdit;

export interface EditImage {
  bytes: ArrayBuffer;
  type: "jpg" | "png";
}

export const LINE_HEIGHT = 1.2;

const FONTS: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  // normal, negrita, cursiva, negrita cursiva
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export const fontName = (e: Pick<TextEdit, "family" | "bold" | "italic">) =>
  FONTS[e.family][(e.bold ? 1 : 0) + (e.italic ? 2 : 0)];

// Las fuentes estándar usan WinAnsi: ASCII, Latin-1 (á, ñ, ü, ¿, ¡…) y unos pocos signos extra.
const WINANSI_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
const encodable = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch);
};

/** Caracteres que las fuentes estándar no pueden escribir (emojis, ✓, letras no latinas…). */
export function unsupportedChars(text: string): string[] {
  return [...new Set([...text.replace(/\r?\n/g, "")].filter((ch) => !encodable(ch)))];
}

const sanitize = (line: string) => [...line].map((ch) => (encodable(ch) ? ch : "?")).join("");

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // 0 | 90 | 180 | 270
}

/**
 * Punto (u, v) de la página tal como se ve (origen arriba-izquierda) → coordenadas internas del PDF
 * (origen abajo-izquierda, sin rotar). Es la misma transformación que usa el visor para mostrarla.
 */
export function toPdfPoint(box: PageBox, u: number, v: number): { x: number; y: number } {
  const { x, y, width: w, height: h } = box;
  switch (box.rotation) {
    case 90:
      return { x: x + v, y: y + u };
    case 180:
      return { x: x + w - u, y: y + v };
    case 270:
      return { x: x + w - v, y: y + h - u };
    default:
      return { x: x + u, y: y + h - v };
  }
}

/** Tamaño de la página tal como se ve (ancho y alto se intercambian si está girada 90/270). */
export function viewSize(box: PageBox) {
  return box.rotation % 180 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

export function pageBox(page: ReturnType<PDFDocument["getPage"]>): PageBox {
  const crop = page.getCropBox();
  const rotation = (((page.getRotation().angle % 360) + 360) % 360) as number;
  return { ...crop, rotation: rotation - (rotation % 90) };
}

/** Aplica las ediciones sobre el PDF original y devuelve el PDF nuevo. El original no se modifica. */
export async function applyEdits(
  source: ArrayBuffer,
  edits: Edit[],
  images: Record<string, EditImage>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source);
  const pages = doc.getPages();
  const fonts = new Map<StandardFonts, PDFFont>();
  const embedded = new Map<string, PDFImage>(); // la misma imagen colocada varias veces se incrusta una sola vez

  // Orden de dibujo: el de la lista (lo último añadido queda encima).
  for (const e of edits) {
    const page = pages[e.page];
    if (!page) throw new Error(`Página fuera de rango: ${e.page + 1}`);
    const box = pageBox(page);
    const rotate = degrees(box.rotation); // el visor gira la página en sentido horario; lo nuevo se pre-gira al revés
    const at = (u: number, v: number) => toPdfPoint(box, u, v);

    if (e.kind === "text") {
      const name = fontName(e);
      if (!fonts.has(name)) fonts.set(name, await doc.embedFont(name));
      const font = fonts.get(name)!;
      const color = hexToRgb(e.color);
      e.text.split(/\r?\n/).forEach((line, i) => {
        if (!line) return;
        const p = at(e.x, e.y + (i * LINE_HEIGHT + e.baseline) * e.size);
        page.drawText(sanitize(line), { ...p, size: e.size, font, color, rotate });
      });
    } else if (e.kind === "image") {
      let img = embedded.get(e.imageId);
      if (!img) {
        const src = images[e.imageId];
        if (!src) throw new Error("Falta una imagen de la edición");
        // embedJpg incrusta el JPEG tal cual, sin recomprimir.
        img = src.type === "jpg" ? await doc.embedJpg(src.bytes) : await doc.embedPng(src.bytes);
        embedded.set(e.imageId, img);
      }
      page.drawImage(img, { ...at(e.x, e.y + e.h), width: e.w, height: e.h, rotate });
    } else if (e.kind === "path") {
      page.drawSvgPath(e.d, {
        ...at(e.x, e.y),
        scale: e.w / e.vbW,
        rotate,
        borderColor: hexToRgb(e.color),
        borderWidth: e.stroke,
        borderLineCap: LineCapStyle.Round,
      });
    } else {
      page.drawRectangle({
        ...at(e.x, e.y + e.h),
        width: e.w,
        height: e.h,
        rotate,
        color: hexToRgb(e.color),
        opacity: e.opacity,
        blendMode: e.multiply ? BlendMode.Multiply : undefined,
      });
    }
  }

  // updateFieldAppearances: false → no regenerar el aspecto de formularios existentes (cambiaría cómo se ven).
  return doc.save({ updateFieldAppearances: false });
}
