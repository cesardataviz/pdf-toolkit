// Fuentes de pantalla equivalentes a las estándar del PDF (mismas métricas de ancho), y la posición de
// la línea base que usa el navegador, para que el texto guardado caiga exactamente donde se ve.
import { LINE_HEIGHT, type FontFamily } from "./editOps";

export const CSS_FONT: Record<FontFamily, string> = {
  helvetica: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", serif',
  courier: '"Courier New", Courier, "Liberation Mono", monospace',
};

const cache = new Map<string, number>();

/** Distancia del borde superior de la línea a la línea base, en em, con line-height = LINE_HEIGHT. */
export function baselineRatio(family: FontFamily, bold: boolean, italic: boolean): number {
  const key = `${family}${bold}${italic}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let ratio = 0.94; // valor típico si el navegador no expone las métricas
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx) {
    ctx.font = `${italic ? "italic " : ""}${bold ? "700 " : ""}100px ${CSS_FONT[family]}`;
    const m = ctx.measureText("Hg");
    if (m.fontBoundingBoxAscent && m.fontBoundingBoxDescent) {
      const asc = m.fontBoundingBoxAscent / 100;
      const desc = m.fontBoundingBoxDescent / 100;
      ratio = (LINE_HEIGHT - (asc + desc)) / 2 + asc; // CSS reparte el interlineado mitad arriba, mitad abajo
    }
  }
  cache.set(key, ratio);
  return ratio;
}
