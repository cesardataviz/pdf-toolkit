"""Servidor opcional de pdf-toolkit.

Todo lo que se puede hacer en el navegador se hace allí. Este servidor solo existe para:
1. Office -> PDF (LibreOffice no corre en el navegador).
2. Servir el frontend compilado en un solo contenedor.

Decisión: endpoint SÍNCRONO con límite de concurrencia, no cola de jobs. Es una herramienta local de un usuario;
una conversión típica tarda segundos. Si algún día se expone a muchos usuarios, pasar al patrón de jobs de files2md.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic_settings import BaseSettings, SettingsConfigDict
from starlette.background import BackgroundTask

OFFICE_EXTS = {"doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp"}
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PDF_TOOLKIT_", env_file=".env", extra="ignore")

    max_upload_mb: int = 100
    timeout_s: int = 180
    max_concurrent: int = 2  # LibreOffice consume mucha RAM; cada conversión es un proceso aparte
    api_token: str = ""
    web_dir: Path = Path("./web_dist")


def safe_name(name: str) -> str:
    cleaned = _SAFE.sub("_", Path(name).name).strip("._") or "file"
    return cleaned[:120]


# Rutas típicas cuando LibreOffice no queda en el PATH (pasa casi siempre en Windows y macOS).
_SOFFICE_PATHS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
]


def find_soffice() -> str | None:
    """PDF_TOOLKIT_SOFFICE_CMD > PATH > rutas de instalación habituales."""
    custom = os.environ.get("PDF_TOOLKIT_SOFFICE_CMD")
    if custom:
        return custom if Path(custom).is_file() else None
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    return next((p for p in _SOFFICE_PATHS if Path(p).is_file()), None)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="pdf-toolkit server", version="0.1.0")
    slots = threading.BoundedSemaphore(settings.max_concurrent)

    def check_token(request: Request) -> None:
        if not settings.api_token:
            return
        supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        if supplied != settings.api_token:
            raise HTTPException(401, "Token inválido")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "libreoffice": find_soffice() is not None}

    @app.post("/api/office-to-pdf")
    def office_to_pdf(request: Request, file: UploadFile = File(...)):
        check_token(request)
        soffice = find_soffice()
        if not soffice:
            raise HTTPException(503, "LibreOffice no está instalado en el servidor. Usa la imagen Docker del proyecto.")

        name = safe_name(file.filename or "documento")
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in OFFICE_EXTS:
            raise HTTPException(415, f"Extensión .{ext} no admitida")

        if not slots.acquire(timeout=30):
            raise HTTPException(429, "Servidor ocupado, intenta en unos segundos")
        workdir = Path(tempfile.mkdtemp(prefix="pdf-toolkit-"))
        try:
            src = workdir / name
            max_bytes = settings.max_upload_mb * 1024 * 1024
            written = 0
            with src.open("wb") as out:
                while chunk := file.file.read(1024 * 1024):
                    written += len(chunk)
                    if written > max_bytes:
                        raise HTTPException(413, f"El archivo supera {settings.max_upload_mb} MB")
                    out.write(chunk)

            # Perfil de usuario aislado por conversión: LibreOffice no tolera perfiles compartidos en paralelo.
            profile = workdir / "lo-profile"
            cmd = [
                soffice, f"-env:UserInstallation=file://{profile}",
                "--headless", "--norestore", "--nolockcheck",
                "--convert-to", "pdf", "--outdir", str(workdir), str(src),
            ]
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=settings.timeout_s)
            except subprocess.TimeoutExpired:
                raise HTTPException(504, "La conversión excedió el tiempo límite") from None

            pdf = workdir / f"{src.stem}.pdf"
            if proc.returncode != 0 or not pdf.is_file():
                raise HTTPException(422, f"LibreOffice no pudo convertir el archivo: {proc.stderr.strip()[:300]}")
        except BaseException:
            shutil.rmtree(workdir, ignore_errors=True)
            raise
        finally:
            slots.release()

        # El directorio temporal se borra después de enviar la respuesta: nada queda en disco.
        return FileResponse(
            pdf, media_type="application/pdf", filename=pdf.name,
            background=BackgroundTask(shutil.rmtree, workdir, ignore_errors=True),
        )

    if settings.web_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
    return app


app = create_app()
