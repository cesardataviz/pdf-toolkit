import { useRef, useState } from "react";
import DropZone from "../components/DropZone";
import PageGrid, { SOURCE_COLORS, type PageItem } from "../components/PageGrid";
import { save, stem } from "../lib/format";
import { buildPdf, listPages } from "../lib/pdfOps";
import { renderThumbnails } from "../lib/thumbnails";

let nextId = 0;

/** Combinar varios PDFs, reordenar (arrastrando), girar y quitar páginas. */
export default function OrganizeTool() {
  const [names, setNames] = useState<string[]>([]);
  const buffers = useRef<ArrayBuffer[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = useRef<HTMLInputElement>(null);

  async function addPdfs(files: File[]) {
    setError(null);
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length < files.length) setError("Solo se agregaron los archivos PDF.");
    for (const file of pdfs) {
      try {
        const buf = await file.arrayBuffer();
        const sourceIndex = buffers.current.length;
        const refs = await listPages([buf]);
        buffers.current.push(buf);
        setNames((prev) => [...prev, file.name]);
        const items: PageItem[] = refs.map((r) => ({ id: `p${nextId++}`, source: sourceIndex, index: r.index, rotate: 0, thumb: null }));
        setPages((prev) => [...prev, ...items]);
        // Las miniaturas llegan de a una: la grilla aparece al instante y se va completando.
        renderThumbnails(buf, 180, (i, url) =>
          setPages((prev) => prev.map((p) => (p.source === sourceIndex && p.index === i ? { ...p, thumb: url } : p))),
        ).catch(() => undefined);
      } catch {
        setError(`No se pudo abrir "${file.name}". ¿Está protegido con contraseña o dañado?`);
      }
    }
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildPdf(buffers.current, pages);
      save(pdf, names.length === 1 ? `${stem(names[0])}-editado.pdf` : "combinado.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    buffers.current = [];
    setNames([]);
    setPages([]);
    setError(null);
  }

  if (names.length === 0) {
    return (
      <>
        <DropZone
          title="Arrastra uno o varios PDFs"
          hint="Combínalos, cambia el orden de las páginas, gíralas o quita las que no necesites."
          accept=".pdf,application/pdf"
          onFiles={addPdfs}
        />
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <div className="workspace">
      <div className="toolbar">
        <div className="toolbar-info">
          <strong>{pages.length} páginas</strong>
          <span className="sources">
            {names.map((n, i) => (
              <span key={`${n}-${i}`} className="source-chip" title={n}>
                {names.length > 1 && <i style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />}
                {n}
              </span>
            ))}
          </span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="button button-ghost" onClick={reset}>
            Empezar de nuevo
          </button>
          <button type="button" className="button button-secondary" onClick={() => more.current?.click()}>
            + Agregar PDF
          </button>
          <button type="button" className="button button-primary" onClick={download} disabled={busy || pages.length === 0}>
            {busy ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
        <input
          ref={more}
          type="file"
          hidden
          multiple
          accept=".pdf,application/pdf"
          onChange={(e) => {
            void addPdfs(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="tip">Arrastra las páginas para cambiar el orden. También puedes usar los botones ← →.</p>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {pages.length === 0 ? (
        <p className="empty">Quitaste todas las páginas. Agrega un PDF o empieza de nuevo.</p>
      ) : (
        <PageGrid pages={pages} sourceNames={names} onChange={setPages} />
      )}
    </div>
  );
}
