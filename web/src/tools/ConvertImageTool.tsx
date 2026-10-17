import { zipSync } from "fflate";
import { useState } from "react";
import DropZone from "../components/DropZone";
import FileCard from "../components/FileCard";
import { save, stem } from "../lib/format";
import { convertImage, type ImageTarget } from "../lib/images";

const TARGETS: { id: ImageTarget; label: string; desc: string }[] = [
  { id: "jpg", label: "JPG", desc: "Fotos; archivo liviano. Lo transparente queda blanco." },
  { id: "png", label: "PNG", desc: "Sin pérdida de calidad; conserva la transparencia." },
  { id: "webp", label: "WebP", desc: "Para web; muy liviano." },
];

/** Convertir imágenes entre JPG, PNG y WebP (por ejemplo, WebP → JPG). */
export default function ConvertImageTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState<ImageTarget>("jpg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const outputs = await Promise.all(files.map((f) => convertImage(f, target)));
      if (outputs.length === 1) {
        save(outputs[0], `${stem(files[0].name)}.${target}`);
      } else {
        const entries: Record<string, Uint8Array> = {};
        const used = new Set<string>();
        for (let i = 0; i < outputs.length; i++) {
          let name = `${stem(files[i].name)}.${target}`;
          for (let n = 2; used.has(name); n++) name = `${stem(files[i].name)} (${n}).${target}`;
          used.add(name);
          entries[name] = new Uint8Array(await outputs[i].arrayBuffer());
        }
        save(zipSync(entries, { level: 0 }), `imagenes-${target}.zip`, "application/zip");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo convertir.");
    } finally {
      setBusy(false);
    }
  }

  if (files.length === 0) {
    return (
      <DropZone
        title="Arrastra tus imágenes"
        hint="Convierte entre JPG, PNG y WebP. Por ejemplo, WebP a JPG."
        accept="image/*"
        onFiles={(f) => setFiles(f.filter((x) => x.type.startsWith("image/")))}
      />
    );
  }

  return (
    <div className="workspace narrow">
      <div className="file-list">
        {files.map((f, i) => (
          <FileCard key={`${f.name}-${i}`} file={f} onChange={() => setFiles((p) => p.filter((_, j) => j !== i))} changeLabel="Quitar" />
        ))}
      </div>
      <fieldset className="choice-group">
        <legend className="field-label">Convertir a</legend>
        <div className="format-grid">
          {TARGETS.map((t) => (
            <label key={t.id} className="format-card">
              <input type="radio" name="target" checked={target === t.id} onChange={() => setTarget(t.id)} />
              <span className="format-head">
                <span className="format-title">{t.label}</span>
              </span>
              <span className="format-desc">{t.desc}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="button" className="button button-primary button-wide" onClick={run} disabled={busy}>
        {busy ? "Convirtiendo…" : files.length === 1 ? `Convertir a ${target.toUpperCase()}` : `Convertir ${files.length} imágenes (.zip)`}
      </button>
    </div>
  );
}
