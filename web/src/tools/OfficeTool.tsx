import { useEffect, useState } from "react";
import DropZone from "../components/DropZone";
import FileCard from "../components/FileCard";
import { save, stem } from "../lib/format";
import { officeServerAvailable, officeToPdf } from "../lib/office";

const ACCEPT = ".doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp";

/** Word, Excel o PowerPoint a PDF. Es lo único que necesita el servidor local (LibreOffice). */
export default function OfficeTool() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    officeServerAvailable().then(setAvailable);
  }, []);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      save(await officeToPdf(file), `${stem(file.name)}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo convertir.");
    } finally {
      setBusy(false);
    }
  }

  if (available === false) {
    return (
      <div className="workspace narrow">
        <p className="notice notice-warn">
          Esta función necesita el servidor local con LibreOffice, porque los documentos de Office no se pueden
          convertir solo en el navegador. Inícialo con <code>docker compose up</code> o instala LibreOffice y ejecuta
          el servidor (ver README). Tus archivos se convierten en tu computadora, no en internet.
        </p>
      </div>
    );
  }

  return (
    <div className="workspace narrow">
      {!file ? (
        <DropZone
          title="Arrastra un documento de Office"
          hint="Word, Excel, PowerPoint u OpenDocument. Se convierte en tu computadora con LibreOffice."
          accept={ACCEPT}
          multiple={false}
          onFiles={(f) => setFile(f[0])}
        />
      ) : (
        <>
          <FileCard file={file} onChange={() => setFile(null)} />
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <button type="button" className="button button-primary button-wide" onClick={run} disabled={busy}>
            {busy ? "Convirtiendo… (unos segundos)" : "Convertir a PDF"}
          </button>
        </>
      )}
    </div>
  );
}
