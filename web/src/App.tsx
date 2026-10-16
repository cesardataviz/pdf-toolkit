import { useEffect, useState } from "react";
import { convertImage, toEmbeddable, type ImageTarget } from "./lib/images";
import { officeServerAvailable, officeToPdf } from "./lib/office";
import { buildPdf, imagesToPdf, listPages, type PageRef } from "./lib/pdfOps";

type Tool = "pages" | "images-pdf" | "image-convert" | "office";

function save(data: Blob | Uint8Array, name: string) {
  const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");

// Esqueleto funcional. Pendiente: miniaturas (pdf.js) y arrastrar para reordenar.
export default function App() {
  const [tool, setTool] = useState<Tool>("pages");
  const [files, setFiles] = useState<File[]>([]);
  const [buffers, setBuffers] = useState<ArrayBuffer[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [target, setTarget] = useState<ImageTarget>("jpg");
  const [office, setOffice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    officeServerAvailable().then(setOffice);
  }, []);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(list: FileList | null) {
    const arr = Array.from(list ?? []);
    setFiles(arr);
    setPages([]);
    if (tool === "pages" && arr.length) {
      await run(async () => {
        const bufs = await Promise.all(arr.map((f) => f.arrayBuffer()));
        setBuffers(bufs);
        setPages(await listPages(bufs));
      });
    }
  }

  const move = (i: number, d: -1 | 1) =>
    setPages((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const rotate = (i: number) =>
    setPages((p) => p.map((x, k) => (k === i ? { ...x, rotate: (x.rotate + 90) % 360 } : x)));
  const remove = (i: number) => setPages((p) => p.filter((_, k) => k !== i));

  const accept: Record<Tool, string> = {
    pages: "application/pdf",
    "images-pdf": "image/*",
    "image-convert": "image/*",
    office: ".doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp",
  };

  return (
    <main style={{ maxWidth: 760, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1>pdf-toolkit</h1>
      <p>Tus archivos se procesan en este navegador. No se suben a ningún servidor.</p>

      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {([
          ["pages", "Combinar / ordenar / rotar PDF"],
          ["images-pdf", "Imágenes → PDF"],
          ["image-convert", "Convertir imagen"],
          ["office", "Word/Excel/PPT → PDF"],
        ] as [Tool, string][]).map(([t, label]) => (
          <button key={t} disabled={tool === t} onClick={() => { setTool(t); setFiles([]); setPages([]); }}>
            {label}
          </button>
        ))}
      </nav>

      <input key={tool} type="file" multiple={tool !== "office"} accept={accept[tool]}
        onChange={(e) => onFiles(e.target.files)} />

      {tool === "pages" && pages.length > 0 && (
        <section>
          <ol>
            {pages.map((p, i) => (
              <li key={`${p.source}-${p.index}-${i}`}>
                {files[p.source]?.name} · pág. {p.index + 1}{p.rotate ? ` · ${p.rotate}°` : ""}{" "}
                <button onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                <button onClick={() => rotate(i)} aria-label="Rotar">⟳</button>
                <button onClick={() => remove(i)} aria-label="Eliminar">✕</button>
              </li>
            ))}
          </ol>
          <button disabled={busy} onClick={() => run(async () => save(await buildPdf(buffers, pages), "resultado.pdf"))}>
            Generar PDF
          </button>
        </section>
      )}

      {tool === "images-pdf" && (
        <p>
          <button disabled={busy || !files.length} onClick={() => run(async () =>
            save(await imagesToPdf(await Promise.all(files.map(toEmbeddable))), "imagenes.pdf"))}>
            Crear PDF ({files.length} imágenes)
          </button>
        </p>
      )}

      {tool === "image-convert" && (
        <p>
          <select value={target} onChange={(e) => setTarget(e.target.value as ImageTarget)}>
            {(["jpg", "png", "webp"] as const).map((t) => <option key={t}>{t}</option>)}
          </select>{" "}
          <button disabled={busy || !files.length} onClick={() => run(async () => {
            for (const f of files) save(await convertImage(f, target), `${stem(f.name)}.${target}`);
          })}>
            Convertir
          </button>
        </p>
      )}

      {tool === "office" && (
        office ? (
          <p>
            <button disabled={busy || !files.length} onClick={() => run(async () =>
              save(await officeToPdf(files[0]), `${stem(files[0].name)}.pdf`))}>
              Convertir a PDF
            </button>{" "}
            <small>Se procesa en el servidor local (LibreOffice), no en internet.</small>
          </p>
        ) : (
          <p>Esta función necesita el servidor opcional con LibreOffice. Ver README: <code>docker compose up</code>.</p>
        )
      )}

      {busy && <p>Procesando…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
