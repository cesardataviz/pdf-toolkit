import { useEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import { save } from "../lib/format";
import { toEmbeddable } from "../lib/images";
import { imagesToPdf } from "../lib/pdfOps";

interface Img {
  id: string;
  file: File;
  url: string;
}

let nextId = 0;

/** Varias imágenes (JPG, PNG, WebP...) a un PDF, una por página, en el orden que elijas. */
export default function ImagesToPdfTool() {
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liberar las vistas previas al salir de la herramienta (la lista vive en una ref para ver la última versión).
  const latest = useRef<Img[]>([]);
  latest.current = images;
  useEffect(() => () => latest.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  function add(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setError(imgs.length < files.length ? "Solo se agregaron las imágenes." : null);
    setImages((prev) => [...prev, ...imgs.map((file) => ({ id: `i${nextId++}`, file, url: URL.createObjectURL(file) }))]);
  }

  function move(i: number, d: -1 | 1) {
    setImages((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      save(await imagesToPdf(await Promise.all(images.map((i) => toEmbeddable(i.file)))), "imagenes.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace">
      {images.length === 0 ? (
        <DropZone
          title="Arrastra tus imágenes"
          hint="JPG, PNG, WebP, GIF o BMP. Cada imagen será una página, en el orden que elijas."
          accept="image/*"
          onFiles={add}
        />
      ) : (
        <>
          <div className="toolbar">
            <div className="toolbar-info">
              <strong>{images.length} imágenes</strong>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="button button-ghost" onClick={() => setImages([])}>
                Empezar de nuevo
              </button>
              <label className="button button-secondary">
                + Agregar imágenes
                <input type="file" hidden multiple accept="image/*" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </label>
              <button type="button" className="button button-primary" onClick={create} disabled={busy}>
                {busy ? "Creando…" : "Crear PDF"}
              </button>
            </div>
          </div>
          <ol className="page-grid">
            {images.map((img, i) => (
              <li key={img.id} className="page-card">
                <div className="page-thumb">
                  <img src={img.url} alt={img.file.name} />
                </div>
                <div className="page-meta">
                  <span className="page-num">{i + 1}</span>
                  <span className="page-actions">
                    <button type="button" className="mini-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover antes">←</button>
                    <button type="button" className="mini-button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Mover después">→</button>
                    <button type="button" className="mini-button mini-danger" onClick={() => setImages((p) => p.filter((x) => x.id !== img.id))} aria-label="Quitar">✕</button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  );
}
