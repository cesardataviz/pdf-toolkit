// Trazos a mano alzada → un path SVG suavizado, recortado a su propio contenido.

export type Point = [number, number];

export interface VectorPath {
  d: string;
  vbW: number;
  vbH: number;
  stroke: number;
  /** Desplazamiento del recorte respecto al sistema original de los puntos. */
  offsetX: number;
  offsetY: number;
}

const r = (n: number) => Math.round(n * 10) / 10;

/** Curvas cuadráticas por los puntos medios: suaviza el temblor del mouse sin perder la forma. */
function strokeToD(pts: Point[], ox: number, oy: number): string {
  const p = pts.map(([x, y]) => [r(x - ox), r(y - oy)] as Point);
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]}L${p[0][0] + 0.1} ${p[0][1]}`; // un punto: un toque
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = r((p[i][0] + p[i + 1][0]) / 2);
    const my = r((p[i][1] + p[i + 1][1]) / 2);
    d += `Q${p[i][0]} ${p[i][1]} ${mx} ${my}`;
  }
  const last = p[p.length - 1];
  return d + `L${last[0]} ${last[1]}`;
}

export function strokesToPath(strokes: Point[][], stroke: number): VectorPath | null {
  const all = strokes.flat();
  if (all.length === 0) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = stroke; // margen para que el grosor del trazo no quede cortado
  const offsetX = Math.min(...xs) - pad;
  const offsetY = Math.min(...ys) - pad;
  const vbW = Math.max(Math.max(...xs) + pad - offsetX, 1);
  const vbH = Math.max(Math.max(...ys) + pad - offsetY, 1);
  return { d: strokes.map((s) => strokeToD(s, offsetX, offsetY)).join(""), vbW, vbH, stroke, offsetX, offsetY };
}
