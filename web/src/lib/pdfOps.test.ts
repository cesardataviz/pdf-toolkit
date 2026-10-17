import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdf, listPages, splitPdf } from "./pdfOps";
import { parseRanges } from "./ranges";

async function pdfWithSizes(widths: number[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  widths.forEach((w) => doc.addPage([w, 500]));
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const widthsOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe("pdfOps", () => {
  it("combina varios PDFs en orden", async () => {
    const a = await pdfWithSizes([100, 101]);
    const b = await pdfWithSizes([200]);
    const out = await buildPdf([a, b], await listPages([a, b]));
    expect(await widthsOf(out)).toEqual([100, 101, 200]);
  });

  it("reordena, elimina y rota páginas", async () => {
    const a = await pdfWithSizes([100, 101, 102]);
    const out = await buildPdf([a], [
      { source: 0, index: 2, rotate: 90 },
      { source: 0, index: 0, rotate: 0 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([102, 100]);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it("rechaza páginas fuera de rango", async () => {
    const a = await pdfWithSizes([100]);
    await expect(buildPdf([a], [{ source: 0, index: 5, rotate: 0 }])).rejects.toThrow("fuera de rango");
  });
});


describe("rangos y división", () => {
  it("interpreta rangos escritos por personas", () => {
    expect(parseRanges("1-3, 5", 10)).toEqual([[0, 1, 2], [4]]);
    expect(parseRanges(" 2 ; 4-4 ", 5)).toEqual([[1], [3]]);
  });

  it("da mensajes claros con rangos inválidos", () => {
    expect(() => parseRanges("", 5)).toThrow("por ejemplo");
    expect(() => parseRanges("7", 5)).toThrow("tiene 5 páginas");
    expect(() => parseRanges("4-2", 5)).toThrow("inicio es mayor");
    expect(() => parseRanges("a-b", 5)).toThrow("no es un rango válido");
  });

  it("divide un PDF en varios", async () => {
    const src = await pdfWithSizes([100, 101, 102, 103]);
    const parts = await splitPdf(src, parseRanges("1-2, 4", 4));
    expect(await Promise.all(parts.map(widthsOf))).toEqual([[100, 101], [103]]);
  });
});
