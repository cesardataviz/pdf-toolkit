export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export const stem = (name: string) => name.replace(/\.[^.]+$/, "");

/** Descarga un archivo generado en el navegador. */
export function save(data: Blob | Uint8Array, name: string, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
