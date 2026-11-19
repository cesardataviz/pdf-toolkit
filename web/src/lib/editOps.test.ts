import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { applyEdits, toPdfPoint, unsupportedChars, viewSize, type Edit, type PageBox } from "./editOps";
import { strokesToPath } from "./paths";

const toBuf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function samplePdf(rotation = 0): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.drawText("Original", { x: 50, y: 700, size: 20, font: await doc.embedFont(StandardFonts.Helvetica) });
  if (rotation) page.setRotation(degrees(rotation));
  return toBuf(await doc.save());
}

/** Texto plano de todos los content streams de la primera página. */
async function pageContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const refs = contents && "asArray" in contents ? contents.asArray() : [doc.getPage(0).node.get(PDFName.of("Contents"))];
  return refs
    .map((ref) => {
      const s = doc.context.lookup(ref!);
      return s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : "";
    })
    .join("\n");
}

// PNG 1×1 rojo.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("toPdfPoint", () => {
  const box = (rotation: number): PageBox => ({ x: 10, y: 20, width: 600, height: 800, rotation });

  it("sin rotación: invierte el eje vertical", () => {
    expect(toPdfPoint(box(0), 0, 0)).toEqual({ x: 10, y: 820 }); // arriba-izquierda visible
    expect(toPdfPoint(box(0), 600, 800)).toEqual({ x: 610, y: 20 });
  });

  it("las esquinas visibles caen en las esquinas del PDF para cada rotación", () => {
    for (const r of [0, 90, 180, 270]) {
      const b = box(r);
      const { width, height } = viewSize(b);
      const corners = [
        toPdfPoint(b, 0, 0),
        toPdfPoint(b, width, 0),
        toPdfPoint(b, width, height),
        toPdfPoint(b, 0, height),
      ].map((p) => `${p.x},${p.y}`);
      expect(new Set(corners)).toEqual(new Set(["10,20", "610,20", "610,820", "10,820"]));
    }
  });

  it("90°: la esquina arriba-izquierda visible es la abajo-izquierda del PDF", () => {
    expect(toPdfPoint(box(90), 0, 0)).toEqual({ x: 10, y: 20 });
  });
});

describe("applyEdits", () => {
  it("conserva intacto el contenido original y añade lo nuevo encima", async () => {
    const src = await samplePdf();
    const before = await pageContent(new Uint8Array(src));
    const edits: Edit[] = [
      { id: "t", kind: "text", page: 0, x: 100, y: 100, text: "Hola, señor\nLínea 2", size: 12, family: "helvetica", bold: true, italic: false, color: "#ff0000", baseline: 0.94 },
      { id: "r", kind: "rect", page: 0, x: 10, y: 10, w: 50, h: 20, color: "#ffffff", opacity: 1, multiply: false },
      { id: "i", kind: "image", page: 0, x: 0, y: 0, w: 30, h: 30, imageId: "png" },
      { id: "i2", kind: "image", page: 0, x: 40, y: 0, w: 30, h: 30, imageId: "png" },
    ];
    const out = await applyEdits(src, edits, { png: { bytes: toBuf(PNG), type: "png" } });
    const after = await pageContent(out);

    expect(after).toContain(before.trim()); // el stream original sigue, byte a byte
    expect(after).toMatch(/^q\n/); // y va envuelto en q/Q: su estado gráfico no afecta lo nuevo

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 600, height: 800 });
    // La misma imagen colocada dos veces se incrusta una sola vez.
    const xobjects = doc.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    expect(new Set(xobjects.values().map(String)).size).toBe(1);
  });

  it("coloca el texto en la posición vista: x igual, y medida desde arriba", async () => {
    const out = await applyEdits(
      await samplePdf(),
      [{ id: "t", kind: "text", page: 0, x: 100, y: 50, text: "A", size: 10, family: "courier", bold: false, italic: false, color: "#000000", baseline: 1 }],
      {},
    );
    // línea base = 50 + 1 × 10 = 60 desde arriba → 800 − 60 = 740 en coordenadas PDF
    expect(await pageContent(out)).toMatch(/1 0 0 1 100 740 Tm/);
  });

  it("en una página girada 90°, gira el texto para que se vea derecho", async () => {
    const out = await applyEdits(
      await samplePdf(90),
      [{ id: "t", kind: "text", page: 0, x: 0, y: 0, text: "A", size: 10, family: "times", bold: false, italic: false, color: "#000000", baseline: 1 }],
      {},
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90); // no cambia la página
    // Girado 90° (cos ≈ 0, sin = 1) y con la línea base en x = 10.
    expect(await pageContent(out)).toMatch(/\n[\d.e-]+ 1 -1 [\d.e-]+ 10 0 Tm\n/);
  });

  it("guarda caracteres no soportados como ? en vez de fallar", async () => {
    expect(unsupportedChars("Hola ✓ ñ 😀")).toEqual(["✓", "😀"]);
    const out = await applyEdits(
      await samplePdf(),
      [{ id: "t", kind: "text", page: 0, x: 0, y: 0, text: "ok ✓", size: 10, family: "helvetica", bold: false, italic: false, color: "#000000", baseline: 1 }],
      {},
    );
    expect(out.length).toBeGreaterThan(0);
  });

  it("dibuja firmas como trazo vectorial", async () => {
    const path = strokesToPath([[[0, 0], [10, 5], [20, 0]]], 2)!;
    const out = await applyEdits(
      await samplePdf(),
      [{ id: "s", kind: "path", page: 0, x: 100, y: 100, w: path.vbW * 2, h: path.vbH * 2, d: path.d, vbW: path.vbW, vbH: path.vbH, stroke: 2, color: "#1a3fb0" }],
      {},
    );
    const content = await pageContent(out);
    expect(content).toMatch(/ [cvy]\n/); // curvas Bézier, no una imagen
    expect(content).not.toContain(" Do\n");
    expect(content).toMatch(/\nS\n/); // solo trazo (stroke), sin relleno
  });

  it("rechaza ediciones en páginas que no existen", async () => {
    await expect(
      applyEdits(await samplePdf(), [{ id: "r", kind: "rect", page: 3, x: 0, y: 0, w: 1, h: 1, color: "#000000", opacity: 1, multiply: false }], {}),
    ).rejects.toThrow("fuera de rango");
  });
});
