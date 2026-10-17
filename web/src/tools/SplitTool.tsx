import { zipSync } from "fflate";
import { useState } from "react";
import DropZone from "../components/DropZone";
import FileCard from "../components/FileCard";
import { save, stem } from "../lib/format";
import { listPages, splitPdf } from "../lib/pdfOps";
import { parseRanges } from "../lib/ranges";
import { renderThumbnails } from "../lib/thumbnails";

type Mode = "extract" | "groups" | "each";

/** Extraer páginas a un PDF nuevo, o dividir en varios PDFs. */
export default function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [total, setTotal] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("extract");
  const [ranges, setRanges] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(files: File[]) {
    const f = files[0];
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const n = (await listPages([buf])).length;
      setFile(f);
      setBuffer(buf);
      setTotal(n);
      setThumbs([]);
      setRanges(n > 1 ? `1-${Math.min(n, 3)}` : "1");
      renderThumbnails(buf, 110).then(setThumbs).catch(() => undefined);
    } catch {
      setError(`No se pudo abrir "${f.name}". ¿Está protegido con contraseña o dañado?`);
    }
  }

  async function run() {
    if (!file || !buffer) return;
    setError(null);
    setBusy(true);
    try {
      const base = stem(file.name);
      if (mode === "extract") {
        const pages = parseRanges(ranges, total).flat();
        const [pdf] = await splitPdf(buffer, [pages]);
        save(pdf, `${base}-paginas.pdf`);
      } else {
        const groups = mode === "each" ? Array.from({ length: total }, (_, i) => [i]) : parseRanges(ranges, total);
        const parts = await splitPdf(buffer, groups);
        const entries: Record<string, Uint8Array> = {};
        parts.forEach((pdf, i) => {
          const g = groups[i];
          const label = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;
          entries[`${base}-${label}.pdf`] = pdf;
        });
        save(zipSync(entries), `${base}-dividido.zip`, "application/zip");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dividir el PDF.");
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <>
        <DropZone
          title="Arrastra un PDF"
          hint="Extrae las páginas que necesitas o separa el documento en varios PDFs."
          accept=".pdf,application/pdf"
          multiple={false}
          onFiles={open}
        />
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <div className="workspace narrow">
      <FileCard file={file} onChange={() => setFile(null)} />
      <p className="tip">{total} páginas</p>
      {thumbs.length > 0 && (
        <ol className="mini-grid" aria-label="Vista previa de las páginas">
          {thumbs.map((t, i) => (
            <li key={i}>
              <img src={t} alt="" />
              <span>{i + 1}</span>
            </li>
          ))}
        </ol>
      )}

      <fieldset className="choice-group">
        <legend className="field-label">¿Qué quieres hacer?</legend>
        <div className="option-list">
          {(
            [
              ["extract", "Extraer páginas", "Un PDF nuevo solo con las páginas que elijas."],
              ["groups", "Dividir por rangos", "Un PDF por cada rango separado por comas (se descarga en .zip)."],
              ["each", "Separar todas las páginas", `Un PDF por página: ${total} archivos en un .zip.`],
            ] as [Mode, string, string][]
          ).map(([id, title, desc]) => (
            <label key={id} className="engine-option">
              <input type="radio" name="split-mode" checked={mode === id} onChange={() => setMode(id)} />
              <span>
                <span className="engine-title">{title}</span>
                <span className="engine-desc">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode !== "each" && (
        <label className="field">
          <span className="field-label">Páginas</span>
          <input
            className="text-input"
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            placeholder="Por ejemplo: 1-3, 5, 8-10"
            inputMode="numeric"
          />
        </label>
      )}

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="button" className="button button-primary button-wide" onClick={run} disabled={busy}>
        {busy ? "Procesando…" : mode === "extract" ? "Extraer y descargar" : "Dividir y descargar (.zip)"}
      </button>
    </div>
  );
}
