import { useState } from "react";
import Header from "./components/Header";
import ConvertImageTool from "./tools/ConvertImageTool";
import ImagesToPdfTool from "./tools/ImagesToPdfTool";
import OfficeTool from "./tools/OfficeTool";
import OrganizeTool from "./tools/OrganizeTool";
import SplitTool from "./tools/SplitTool";

type ToolId = "organize" | "split" | "images" | "convert" | "office";

const TOOLS: { id: ToolId; label: string; title: string; lede: string }[] = [
  {
    id: "organize",
    label: "Combinar y ordenar",
    title: "Combina y ordena tus PDFs",
    lede: "Junta varios PDFs, arrastra las páginas para cambiar el orden, gíralas o quita las que sobran.",
  },
  {
    id: "split",
    label: "Dividir o extraer",
    title: "Divide un PDF o extrae páginas",
    lede: "Quédate solo con las páginas que necesitas o separa el documento en varios archivos.",
  },
  {
    id: "images",
    label: "Imágenes a PDF",
    title: "Convierte imágenes en un PDF",
    lede: "Fotos, capturas o escaneos en JPG, PNG o WebP: una imagen por página, en el orden que elijas.",
  },
  {
    id: "convert",
    label: "Convertir imagen",
    title: "Convierte imágenes de formato",
    lede: "Pasa de WebP a JPG, de PNG a JPG y más, sin perder tiempo ni subir nada.",
  },
  {
    id: "office",
    label: "Word, Excel, PPT a PDF",
    title: "Convierte documentos de Office a PDF",
    lede: "Word, Excel y PowerPoint a PDF con LibreOffice, en tu propia computadora.",
  },
];

export default function App() {
  const [tool, setTool] = useState<ToolId>("organize");
  const current = TOOLS.find((t) => t.id === tool)!;

  return (
    <div className="app">
      <Header />
      <main className="main">
        <nav className="tool-tabs" aria-label="Herramientas">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tool-tab"
              aria-current={t.id === tool ? "page" : undefined}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <header className="tool-head">
          <h1 className="tool-title">{current.title}</h1>
          <p className="lede">{current.lede}</p>
        </header>

        {/* key: cada herramienta empieza limpia al cambiar de pestaña */}
        <section className="tool-body" key={tool}>
          {tool === "organize" && <OrganizeTool />}
          {tool === "split" && <SplitTool />}
          {tool === "images" && <ImagesToPdfTool />}
          {tool === "convert" && <ConvertImageTool />}
          {tool === "office" && <OfficeTool />}
        </section>
      </main>
      <footer className="footer">
        <span>pdf-toolkit · un producto de Softcom · código abierto con licencia MIT</span>
      </footer>
    </div>
  );
}
