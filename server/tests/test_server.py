from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import Settings, create_app


def client(tmp_path, **kw) -> TestClient:
    return TestClient(create_app(Settings(web_dir=tmp_path / "noweb", **kw)))


@pytest.fixture
def fake_soffice(monkeypatch):
    """Simula LibreOffice: escribe un PDF falso donde lo haría soffice."""

    def run(cmd, **_):
        outdir = Path(cmd[cmd.index("--outdir") + 1])
        src = Path(cmd[-1])
        (outdir / f"{src.stem}.pdf").write_bytes(b"%PDF-1.4 fake")

        class R:
            returncode, stderr = 0, ""

        return R()

    monkeypatch.setattr(main, "find_soffice", lambda: "/usr/bin/soffice")
    monkeypatch.setattr(main.subprocess, "run", run)


def test_health_reports_libreoffice(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "find_soffice", lambda: None)
    assert client(tmp_path).get("/api/health").json() == {"status": "ok", "libreoffice": False}


def test_without_libreoffice_returns_actionable_503(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "find_soffice", lambda: None)
    r = client(tmp_path).post("/api/office-to-pdf", files={"file": ("a.docx", b"PK", "application/octet-stream")})
    assert r.status_code == 503
    assert "LibreOffice" in r.json()["detail"]


def test_converts_and_cleans_up(tmp_path, fake_soffice):
    r = client(tmp_path).post("/api/office-to-pdf", files={"file": ("../../Informe final.docx", b"PK", "x")})
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    assert "Informe_final.pdf" in r.headers["content-disposition"]


def test_rejects_bad_extension_size_and_token(tmp_path, fake_soffice):
    assert client(tmp_path).post("/api/office-to-pdf", files={"file": ("a.exe", b"MZ", "x")}).status_code == 415
    big = client(tmp_path, max_upload_mb=0).post("/api/office-to-pdf", files={"file": ("a.docx", b"PK", "x")})
    assert big.status_code == 413
    locked = client(tmp_path, api_token="s3")
    assert locked.post("/api/office-to-pdf", files={"file": ("a.docx", b"PK", "x")}).status_code == 401
    ok = locked.post("/api/office-to-pdf", files={"file": ("a.docx", b"PK", "x")},
                     headers={"Authorization": "Bearer s3"})
    assert ok.status_code == 200


@pytest.mark.skipif(main.find_soffice() is None, reason="LibreOffice no instalado")
def test_real_libreoffice_converts_docx(tmp_path):
    """Conversión real de punta a punta (sin simular soffice)."""
    import io

    docx = pytest.importorskip("docx")
    doc = docx.Document()
    doc.add_heading("Contrato de prueba", level=1)
    doc.add_paragraph("Texto con tildes: acción, niño, información.")
    buf = io.BytesIO()
    doc.save(buf)

    r = client(tmp_path).post(
        "/api/office-to-pdf", files={"file": ("Contrato prueba.docx", buf.getvalue(), "application/octet-stream")}
    )
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"%PDF")
    from pypdf import PdfReader

    text = PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
    assert "Contrato de prueba" in text and "niño" in text


def test_soffice_path_override(tmp_path, monkeypatch):
    fake = tmp_path / "soffice.exe"
    fake.write_text("")
    monkeypatch.setenv("PDF_TOOLKIT_SOFFICE_CMD", str(fake))
    assert main.find_soffice() == str(fake)
    monkeypatch.setenv("PDF_TOOLKIT_SOFFICE_CMD", str(tmp_path / "no-existe.exe"))
    assert main.find_soffice() is None
