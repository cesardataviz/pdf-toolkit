// Office -> PDF es lo único que necesita servidor (LibreOffice). Es opcional.

export async function officeServerAvailable(): Promise<boolean> {
  try {
    const r = await fetch("/api/health");
    if (!r.ok) return false;
    return Boolean((await r.json()).libreoffice);
  } catch {
    return false;
  }
}

export async function officeToPdf(file: File): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  const token = (() => {
    try {
      return localStorage.getItem("pdf_toolkit_token");
    } catch {
      return null;
    }
  })();
  const r = await fetch("/api/office-to-pdf", {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `Error ${r.status}`);
  return r.blob();
}
