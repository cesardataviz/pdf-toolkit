import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import SignaturePad, { SignatureSvg, type Signature } from "../components/SignaturePad";
import { save, stem } from "../lib/format";
import { toEmbeddable } from "../lib/images";
import {
  LINE_HEIGHT,
  applyEdits,
  unsupportedChars,
  type Edit,
  type EditImage,
  type FontFamily,
  type TextEdit,
} from "../lib/editOps";
import { strokesToPath, type Point } from "../lib/paths";
import { openPdf, releaseCanvas, renderPage, type ViewPage } from "../lib/pdfView";
import { CSS_FONT, baselineRatio } from "../lib/textMetrics";

type Tool = "select" | "text" | "pen" | "whiteout" | "highlight" | "place";

interface ImageAsset extends EditImage {
  url: string;
  width: number; // px naturales
  height: number;
}

/** Lo que se va a colocar con el próximo clic: una imagen o una firma. */
type Pending =
  | { kind: "image"; imageId: string; w: number; h: number }
  | { kind: "signature"; sig: Signature };

type Draft = { page: number; points: Point[] } | { page: number; x0: number; y0: number; x1: number; y1: number };

interface TextStyle {
  family: FontFamily;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

const FAMILIES: [FontFamily, string][] = [
  ["helvetica", "Helvetica"],
  ["times", "Times"],
  ["courier", "Courier"],
];

const PEN_COLORS = ["#000000", "#1a3fb0", "#c81e1e", "#0b7a3e"];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

let seq = 0;
const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

const textHeight = (e: TextEdit) => Math.max(e.text.split("\n").length, 1) * LINE_HEIGHT * e.size;

/* ======================================================================== página */

interface PageViewProps {
  doc: PDFDocumentProxy;
  index: number;
  size: ViewPage;
  zoom: number;
  tool: Tool;
  onLayerDown: (index: number, e: React.PointerEvent<HTMLDivElement>) => void;
  onLayerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onLayerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

/** Una página: el canvas se dibuja solo cuando está cerca de la vista y se libera al alejarse. */
function PageView({ doc, index, size, zoom, tool, onLayerDown, onLayerMove, onLayerUp, children }: PageViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!visible) {
      releaseCanvas(c);
      return;
    }
    return renderPage(doc, index, c, zoom);
  }, [doc, index, zoom, visible]);

  return (
    <div
      ref={wrap}
      className="ed-page"
      data-page={index}
      style={{ width: size.width * zoom, height: size.height * zoom }}
    >
      <canvas ref={canvas} className="ed-canvas" aria-hidden="true" />
      <div
        className={`ed-layer tool-${tool}`}
        onPointerDown={(e) => onLayerDown(index, e)}
        onPointerMove={onLayerMove}
        onPointerUp={onLayerUp}
        onPointerCancel={onLayerUp}
        aria-label={`Página ${index + 1}`}
      >
        {children}
      </div>
    </div>
  );
}

/* ======================================================================== herramienta */

export default function EditTool() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<ViewPage[]>([]);
  const [edits, setEditsState] = useState<Edit[]>([]);
  const [images, setImages] = useState<Record<string, ImageAsset>>({});
  const [tool, setTool] = useState<Tool>("select");
  const [pending, setPending] = useState<Pending | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [textStyle, setTextStyle] = useState<TextStyle>({ family: "helvetica", size: 12, bold: false, italic: false, color: "#000000" });
  const [pen, setPen] = useState({ color: "#000000", width: 1.5 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const editsRef = useRef<Edit[]>([]);
  const past = useRef<Edit[][]>([]);
  const future = useRef<Edit[][]>([]);
  const [, bumpHistory] = useState(0);
  const pagesBox = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; orig: Edit; recorded: boolean } | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const zoomAnchor = useRef<number | null>(null);

  /* ---------------- historial: record() guarda el estado actual antes de un cambio */
  const setEdits = useCallback((next: Edit[] | ((prev: Edit[]) => Edit[])) => {
    const value = typeof next === "function" ? next(editsRef.current) : next;
    editsRef.current = value;
    setEditsState(value);
    setDirty(true);
  }, []);

  const record = useCallback(() => {
    past.current.push(editsRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    bumpHistory((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(editsRef.current);
    setEdits(prev);
    setEditing(null);
    bumpHistory((n) => n + 1);
  }, [setEdits]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(editsRef.current);
    setEdits(next);
    setEditing(null);
    bumpHistory((n) => n + 1);
  }, [setEdits]);

  const update = useCallback(
    (id: string, patch: Partial<Edit>) => setEdits((list) => list.map((e) => (e.id === id ? ({ ...e, ...patch } as Edit) : e))),
    [setEdits],
  );

  const remove = useCallback(
    (id: string) => {
      record();
      setEdits((list) => list.filter((e) => e.id !== id));
      setSelected(null);
      setEditing(null);
    },
    [record, setEdits],
  );

  /* ---------------- abrir */
  async function open(files: File[]) {
    const f = files[0];
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const opened = await openPdf(buf);
      doc?.destroy();
      setFile(f);
      setBuffer(buf);
      setDoc(opened.doc);
      setPages(opened.pages);
      setEdits([]);
      setDirty(false);
      past.current = [];
      future.current = [];
      setSelected(null);
      setEditing(null);
      setTool("select");
    } catch {
      setError(`No se pudo abrir "${f.name}". ¿Está protegido con contraseña o dañado?`);
    }
  }

  // Zoom inicial: la página más ancha cabe entera, sin pasar de 150 %. Se mide ya montado el contenedor.
  useLayoutEffect(() => {
    if (!doc || !pages.length) return;
    const avail = Math.max((pagesBox.current?.clientWidth ?? 600) - 50, 200);
    setZoom(Math.min(1.5, Math.max(0.25, avail / Math.max(...pages.map((p) => p.width)))));
  }, [doc, pages]);

  // Liberar el documento de pdf.js y las URLs de imágenes al salir.
  useEffect(() => () => void doc?.destroy(), [doc]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => Object.values(imagesRef.current).forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty || editsRef.current.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------------- zoom, conservando el punto de lectura */
  const changeZoom = useCallback((z: number) => {
    const box = pagesBox.current;
    if (box) {
      const top = box.getBoundingClientRect().top + window.scrollY;
      zoomAnchor.current = (window.scrollY + window.innerHeight / 3 - top) / box.scrollHeight;
    }
    setZoom(Math.min(4, Math.max(0.25, Math.round(z * 100) / 100)));
  }, []);

  useLayoutEffect(() => {
    const box = pagesBox.current;
    if (zoomAnchor.current === null || !box) return;
    const top = box.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + zoomAnchor.current * box.scrollHeight - window.innerHeight / 3 });
    zoomAnchor.current = null;
  }, [zoom]);

  const zoomStep = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.01) : [...ZOOMS].reverse().find((z) => z < zoom - 0.01);
    changeZoom(next ?? zoom);
  };

  const fitWidth = () => {
    const avail = Math.max((pagesBox.current?.clientWidth ?? 600) - 48, 200);
    changeZoom(avail / Math.max(...pages.map((p) => p.width)));
  };

  // Ctrl + rueda = zoom (como en cualquier visor de PDF).
  useEffect(() => {
    const box = pagesBox.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      changeZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoom, changeZoom, doc]);

  // Página actual (la que cruza el tercio superior de la ventana).
  useEffect(() => {
    if (!doc) return;
    const onScroll = () => {
      const line = window.innerHeight / 3;
      const els = pagesBox.current?.querySelectorAll<HTMLElement>(".ed-page") ?? [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom >= line) {
          setCurrent(Number(el.dataset.page));
          break;
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [doc, zoom]);

  /* ---------------- crear elementos */
  const selectedEdit = edits.find((e) => e.id === selected) ?? null;

  function addEdit(e: Edit) {
    record();
    setEdits((list) => [...list, e]);
    setSelected(e.id);
  }

  function newText(page: number, u: number, v: number) {
    const s = textStyle;
    const e: TextEdit = {
      id: newId(),
      kind: "text",
      page,
      x: u,
      y: Math.max(0, v - s.size * 0.6),
      text: "",
      ...s,
      baseline: baselineRatio(s.family, s.bold, s.italic),
    };
    addEdit(e);
    setEditing(e.id);
  }

  function place(page: number, u: number, v: number) {
    if (!pending) return;
    const size = pages[page];
    if (pending.kind === "image") {
      const { w, h, imageId } = pending;
      addEdit({ id: newId(), kind: "image", page, imageId, w, h, x: clampTo(u - w / 2, size.width - w), y: clampTo(v - h / 2, size.height - h) });
    } else {
      const sig = pending.sig;
      const w = Math.min(170, size.width * 0.35);
      const h = (w * sig.vbH) / sig.vbW;
      addEdit({
        id: newId(),
        kind: "path",
        page,
        d: sig.d,
        vbW: sig.vbW,
        vbH: sig.vbH,
        stroke: sig.stroke,
        color: sig.color,
        w,
        h,
        x: clampTo(u - w / 2, size.width - w),
        y: clampTo(v - h / 2, size.height - h),
      });
    }
    setPending(null);
    setTool("select");
  }

  const clampTo = (n: number, max: number) => Math.max(0, Math.min(n, Math.max(max, 0)));

  async function pickImage(f: File) {
    setError(null);
    try {
      const emb = await toEmbeddable(f);
      const blob = new Blob([emb.bytes], { type: emb.type === "jpg" ? "image/jpeg" : "image/png" });
      const bmp = await createImageBitmap(blob);
      const asset: ImageAsset = { ...emb, url: URL.createObjectURL(blob), width: bmp.width, height: bmp.height };
      bmp.close();
      const id = newId();
      setImages((all) => ({ ...all, [id]: asset }));
      // Tamaño inicial: el natural (96 ppp → 72 pt), sin pasar del 45 % del ancho de la página actual.
      const pageW = pages[current]?.width ?? 595;
      const w = Math.min(asset.width * 0.75, pageW * 0.45);
      setPending({ kind: "image", imageId: id, w, h: (w * asset.height) / asset.width });
      setTool("place");
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la imagen.");
    }
  }

  /* ---------------- eventos sobre la página (crear, dibujar) */
  const pagePoint = (e: React.PointerEvent, el: HTMLElement): Point => {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  function onLayerDown(page: number, e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    // Sin esto, el mousedown que sigue mueve el foco a la página y el cuadro de texto nuevo lo pierde.
    e.preventDefault();
    const [u, v] = pagePoint(e, e.currentTarget);
    if (editing) {
      setEditing(null);
      if (tool === "select") return; // el clic solo sale del modo edición
    }
    if (tool === "text") return newText(page, u, v);
    if (tool === "place") return place(page, u, v);
    if (tool === "pen" || tool === "whiteout" || tool === "highlight") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const d: Draft = tool === "pen" ? { page, points: [[u, v]] } : { page, x0: u, y0: v, x1: u, y1: v };
      draftRef.current = d;
      setDraft(d);
      return;
    }
    setSelected(null);
  }

  function onLayerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = draftRef.current;
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const [u, v] = pagePoint(e, e.currentTarget);
    let next: Draft;
    if ("points" in d) {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(u - last[0], v - last[1]) * zoom < 1.5) return;
      next = { ...d, points: [...d.points, [u, v]] };
    } else {
      next = { ...d, x1: u, y1: v };
    }
    draftRef.current = next;
    setDraft(next);
  }

  function onLayerUp() {
    const d = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!d) return;
    if ("points" in d) {
      const path = strokesToPath([d.points], pen.width);
      if (!path) return;
      addEdit({
        id: newId(),
        kind: "path",
        page: d.page,
        d: path.d,
        vbW: path.vbW,
        vbH: path.vbH,
        stroke: pen.width,
        color: pen.color,
        x: path.offsetX,
        y: path.offsetY,
        w: path.vbW,
        h: path.vbH,
      });
      setSelected(null); // con el lápiz se sigue dibujando
    } else {
      const x = Math.min(d.x0, d.x1);
      const y = Math.min(d.y0, d.y1);
      const w = Math.abs(d.x1 - d.x0);
      const h = Math.abs(d.y1 - d.y0);
      if (w < 2 || h < 2) return;
      const hl = tool === "highlight";
      addEdit({ id: newId(), kind: "rect", page: d.page, x, y, w, h, color: hl ? "#ffe14d" : "#ffffff", opacity: hl ? 0.45 : 1, multiply: hl });
    }
  }

  /* ---------------- mover y redimensionar elementos */
  function onElDown(ed: Edit, mode: "move" | "resize", e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0 || tool === "pen" || tool === "whiteout" || tool === "highlight") return;
    e.stopPropagation();
    if (editing === ed.id && mode === "move") return; // dentro del texto en edición: seleccionar letras
    e.preventDefault();
    if (editing && editing !== ed.id) setEditing(null);
    if (tool === "text" && ed.kind !== "text" && mode === "move") {
      // Escribir encima de un rectángulo o imagen (p. ej. tapar y reescribir).
      const layer = e.currentTarget.closest<HTMLElement>(".ed-layer");
      if (layer) {
        const [u, v] = pagePoint(e, layer);
        newText(ed.page, u, v);
      }
      return;
    }
    if (tool === "text" && ed.kind === "text" && mode === "move") {
      setSelected(ed.id);
      setEditing(ed.id);
      record();
      return;
    }
    if (tool === "place") return;
    setSelected(ed.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: ed.id, mode, sx: e.clientX, sy: e.clientY, orig: ed, recorded: false };
  }

  function onElMove(e: React.PointerEvent<HTMLElement>) {
    const g = drag.current;
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = (e.clientX - g.sx) / zoom;
    const dy = (e.clientY - g.sy) / zoom;
    if (!g.recorded) {
      if (Math.hypot(dx, dy) * zoom < 3) return; // un clic no es un arrastre
      record();
      g.recorded = true;
    }
    const o = g.orig;
    const size = pages[o.page];
    if (g.mode === "move") {
      update(o.id, { x: Math.max(-5, Math.min(o.x + dx, size.width - 5)), y: Math.max(-5, Math.min(o.y + dy, size.height - 5)) });
      return;
    }
    if (o.kind === "text") {
      const h0 = textHeight(o);
      update(o.id, { size: Math.max(4, Math.min(400, Math.round(o.size * ((h0 + dy) / h0) * 2) / 2)) });
    } else if (o.kind === "rect") {
      update(o.id, { w: Math.max(2, o.w + dx), h: Math.max(2, o.h + dy) });
    } else {
      const w = Math.max(8, o.w + dx); // imágenes y firmas: proporción fija
      update(o.id, { w, h: (w * o.h) / o.w });
    }
  }

  function onElUp(e: React.PointerEvent<HTMLElement>) {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
  }

  /* ---------------- teclado */
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else if (pending) {
          setPending(null);
          setTool("select");
        } else if (selected) setSelected(null);
        else setTool("select");
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove(selected);
      } else if (selected && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const ed = editsRef.current.find((x) => x.id === selected);
        if (!ed) return;
        record();
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        update(ed.id, { x: ed.x + dx, y: ed.y + dy });
      } else if (!mod && !e.altKey) {
        const shortcut: Record<string, Tool> = { v: "select", t: "text", d: "pen", b: "whiteout", r: "highlight" };
        const t = shortcut[e.key.toLowerCase()];
        if (t) chooseTool(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function duplicate() {
    const ed = editsRef.current.find((x) => x.id === selected);
    if (!ed) return;
    const copy = { ...ed, id: newId(), x: ed.x + 12, y: ed.y + 12 } as Edit;
    addEdit(copy);
  }

  function reorder(dir: "front" | "back") {
    if (!selected) return;
    record();
    setEdits((list) => {
      const item = list.find((x) => x.id === selected)!;
      const rest = list.filter((x) => x.id !== selected);
      return dir === "front" ? [...rest, item] : [item, ...rest];
    });
  }

  // Al terminar de escribir, un texto vacío desaparece.
  useEffect(() => {
    const list = editsRef.current;
    const empty = list.filter((e) => e.kind === "text" && e.id !== editing && !e.text.trim());
    if (empty.length) setEdits(list.filter((e) => !empty.includes(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function chooseTool(t: Tool) {
    setTool(t);
    setPending(null);
    setEditing(null);
    if (t !== "select") setSelected(null);
  }

  /* ---------------- propiedades */
  function setStyle(patch: Partial<TextStyle>) {
    const next = { ...textStyle, ...patch };
    setTextStyle(next);
    if (selectedEdit?.kind === "text") {
      record();
      update(selectedEdit.id, { ...patch, baseline: baselineRatio(next.family, next.bold, next.italic) });
    }
  }

  // Al seleccionar un texto, sus estilos pasan a ser los de los próximos textos.
  useEffect(() => {
    if (selectedEdit?.kind === "text") {
      const { family, size, bold, italic, color } = selectedEdit;
      setTextStyle({ family, size, bold, italic, color });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* ---------------- guardar */
  async function download() {
    if (!buffer || !file) return;
    setError(null);
    setNotice(null);
    setEditing(null);
    setBusy(true);
    try {
      const list = editsRef.current.filter((e) => e.kind !== "text" || e.text.trim());
      const pdf = await applyEdits(buffer, list, images);
      save(pdf, `${stem(file.name)}-editado.pdf`);
      setDirty(false);
      const bad = [...new Set(list.flatMap((e) => (e.kind === "text" ? unsupportedChars(e.text) : [])))];
      if (bad.length) setNotice(`Estos caracteres no existen en las fuentes del PDF y se guardaron como "?": ${bad.join(" ")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  /* ======================================================================== vista */
  if (!file || !doc) {
    return (
      <>
        <DropZone
          title="Arrastra un PDF para editarlo"
          hint="Escribe texto, añade imágenes, firma, tapa o resalta. El contenido original no se toca."
          accept=".pdf,application/pdf"
          multiple={false}
          onFiles={open}
        />
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </>
    );
  }

  const textProps = selectedEdit?.kind === "text" ? selectedEdit : tool === "text" ? textStyle : null;
  const bad = selectedEdit?.kind === "text" ? unsupportedChars(selectedEdit.text) : [];
  const hint =
    tool === "place"
      ? `Haz clic en la página donde quieres poner ${pending?.kind === "signature" ? "la firma" : "la imagen"}. Esc para cancelar.`
      : tool === "text"
        ? "Haz clic donde quieras escribir."
        : tool === "pen"
          ? "Dibuja sobre la página."
          : tool === "whiteout"
            ? "Arrastra para tapar con un rectángulo (útil para corregir: tapa y escribe encima)."
            : tool === "highlight"
              ? "Arrastra sobre el texto que quieres resaltar."
              : null;

  const TOOLS: [Tool, string, string, React.ReactNode][] = [
    ["select", "Seleccionar", "V", <path key="i" d="M5 3l14 8-6 1.5L10 19z" />],
    ["text", "Texto", "T", <path key="i" d="M5 5h14M12 5v14M9 19h6" />],
    ["pen", "Dibujar", "D", <path key="i" d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />],
    ["whiteout", "Tapar", "B", <path key="i" d="M4 6h16v12H4zM8 10h8M8 14h5" />],
    ["highlight", "Resaltar", "R", <path key="i" d="M9 15l-3 3h5l1-1M9 15l7-10 3 2-6 10-4-2" />],
  ];

  return (
    <div className="workspace editor">
      <div className="toolbar ed-toolbar">
        <div className="ed-tools" role="toolbar" aria-label="Herramientas de edición">
          {TOOLS.map(([id, label, key, icon]) => (
            <button
              key={id}
              type="button"
              className="ed-tool"
              aria-pressed={tool === id}
              onClick={() => chooseTool(id)}
              title={`${label} (${key})`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className="ed-tool" aria-pressed={tool === "place" && pending?.kind === "image"} onClick={() => imageInput.current?.click()} title="Imagen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5" />
              <circle cx="15.5" cy="9" r="1.5" />
            </svg>
            <span>Imagen</span>
          </button>
          <button type="button" className="ed-tool ed-tool-accent" aria-pressed={tool === "place" && pending?.kind === "signature"} onClick={() => setSigOpen(true)} title="Firmar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17c3-1 4-9 6-9s-1 9 2 9 3-5 5-5 1 4 5 4M3 21h18" />
            </svg>
            <span>Firmar</span>
          </button>
        </div>

        <div className="toolbar-actions">
          <span className="ed-group">
            <button type="button" className="mini-button" onClick={undo} disabled={!past.current.length} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
            <button type="button" className="mini-button" onClick={redo} disabled={!future.current.length} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">↷</button>
          </span>
          <span className="ed-group">
            <button type="button" className="mini-button" onClick={() => zoomStep(-1)} aria-label="Alejar" title="Alejar">−</button>
            <button type="button" className="ed-zoom" onClick={fitWidth} title="Ajustar al ancho">{Math.round(zoom * 100)} %</button>
            <button type="button" className="mini-button" onClick={() => zoomStep(1)} aria-label="Acercar" title="Acercar">+</button>
          </span>
          <button type="button" className="button button-primary" onClick={download} disabled={busy}>
            {busy ? "Guardando…" : "Guardar PDF"}
          </button>
        </div>

        {/* Barra contextual: propiedades de lo seleccionado o de la herramienta activa */}
        <div className="ed-props">
          {textProps && (
            <>
              <select className="ed-select" value={textProps.family} onChange={(e) => setStyle({ family: e.target.value as FontFamily })} aria-label="Fuente">
                {FAMILIES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                className="ed-num"
                type="number"
                min={4}
                max={400}
                step={0.5}
                value={textProps.size}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 4 && n <= 400) setStyle({ size: n });
                }}
                aria-label="Tamaño en puntos"
                title="Tamaño (pt)"
              />
              <button type="button" className="ed-toggle" aria-pressed={textProps.bold} onClick={() => setStyle({ bold: !textProps.bold })} title="Negrita">
                <b>N</b>
              </button>
              <button type="button" className="ed-toggle" aria-pressed={textProps.italic} onClick={() => setStyle({ italic: !textProps.italic })} title="Cursiva">
                <i>K</i>
              </button>
              <input className="ed-color" type="color" value={textProps.color} onChange={(e) => setStyle({ color: e.target.value })} aria-label="Color del texto" title="Color" />
            </>
          )}
          {tool === "pen" && !selectedEdit && (
            <>
              {PEN_COLORS.map((c) => (
                <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={pen.color === c} onClick={() => setPen({ ...pen, color: c })} aria-label={`Color ${c}`} />
              ))}
              <label className="ed-inline">
                Grosor
                <input type="range" min={0.5} max={8} step={0.5} value={pen.width} onChange={(e) => setPen({ ...pen, width: Number(e.target.value) })} />
              </label>
            </>
          )}
          {selectedEdit && selectedEdit.kind !== "text" && selectedEdit.kind !== "image" && (
            <input
              className="ed-color"
              type="color"
              value={selectedEdit.color}
              onChange={(e) => {
                record();
                update(selectedEdit.id, { color: e.target.value });
              }}
              aria-label="Color"
              title="Color"
            />
          )}
          {selectedEdit?.kind === "rect" && (
            <label className="ed-inline">
              Opacidad
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={selectedEdit.opacity}
                onPointerDown={record}
                onChange={(e) => update(selectedEdit.id, { opacity: Number(e.target.value) })}
              />
            </label>
          )}
          {selectedEdit && (
            <span className="ed-group ed-group-end">
              <button type="button" className="mini-button" onClick={() => reorder("back")} title="Enviar al fondo" aria-label="Enviar al fondo">⤓</button>
              <button type="button" className="mini-button" onClick={() => reorder("front")} title="Traer al frente" aria-label="Traer al frente">⤒</button>
              <button type="button" className="mini-button" onClick={duplicate} title="Duplicar (Ctrl+D)" aria-label="Duplicar">⧉</button>
              <button type="button" className="mini-button mini-danger" onClick={() => remove(selectedEdit.id)} title="Eliminar (Supr)" aria-label="Eliminar">✕</button>
            </span>
          )}
          {!textProps && !selectedEdit && tool !== "pen" && (
            <span className="tip">{hint ?? "Elige una herramienta. Selecciona un elemento para moverlo, cambiar su tamaño o borrarlo."}</span>
          )}
          {(textProps || tool === "pen") && hint && !selectedEdit && <span className="tip">{hint}</span>}
          <span className="ed-page-num">
            {file.name} · pág. {current + 1} / {pages.length}
          </span>
        </div>
      </div>

      {bad.length > 0 && (
        <p className="notice notice-warn" role="status">
          Las fuentes estándar del PDF no tienen estos caracteres; se guardarán como "?": {bad.join(" ")}
        </p>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-warn" role="status">{notice}</p>}

      <div className="ed-pages" ref={pagesBox}>
        {pages.map((size, i) => (
          <PageView
            key={i}
            doc={doc}
            index={i}
            size={size}
            zoom={zoom}
            tool={tool}
            onLayerDown={onLayerDown}
            onLayerMove={onLayerMove}
            onLayerUp={onLayerUp}
          >
            {edits
              .filter((ed) => ed.page === i)
              .map((ed) => (
                <EditView
                  key={ed.id}
                  ed={ed}
                  zoom={zoom}
                  image={ed.kind === "image" ? images[ed.imageId] : undefined}
                  selected={selected === ed.id}
                  editing={editing === ed.id}
                  onDown={onElDown}
                  onMove={onElMove}
                  onUp={onElUp}
                  onStartEdit={() => {
                    if (ed.kind !== "text") return;
                    record();
                    setEditing(ed.id);
                  }}
                  onText={(text) => update(ed.id, { text })}
                />
              ))}
            {draft?.page === i && <DraftView draft={draft} zoom={zoom} pen={pen} tool={tool} />}
          </PageView>
        ))}
      </div>

      <input
        ref={imageInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickImage(f);
          e.target.value = "";
        }}
      />
      {sigOpen && (
        <SignaturePad
          onClose={() => setSigOpen(false)}
          onPick={(sig) => {
            setSigOpen(false);
            setPending({ kind: "signature", sig });
            setTool("place");
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

/* ======================================================================== elementos */

interface EditViewProps {
  ed: Edit;
  zoom: number;
  image?: ImageAsset;
  selected: boolean;
  editing: boolean;
  onDown: (ed: Edit, mode: "move" | "resize", e: React.PointerEvent<HTMLElement>) => void;
  onMove: (e: React.PointerEvent<HTMLElement>) => void;
  onUp: (e: React.PointerEvent<HTMLElement>) => void;
  onStartEdit: () => void;
  onText: (text: string) => void;
}

function EditView({ ed, zoom, image, selected, editing, onDown, onMove, onUp, onStartEdit, onText }: EditViewProps) {
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const t = area.current;
      t?.focus();
      t?.setSelectionRange(t.value.length, t.value.length);
    }
  }, [editing]);

  const pos: React.CSSProperties = { left: ed.x * zoom, top: ed.y * zoom };
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => onDown(ed, "move", e),
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onUp,
  };
  const handle = selected && !editing && (
    <span
      className="ed-handle"
      onPointerDown={(e) => onDown(ed, "resize", e)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-hidden="true"
    />
  );
  const cls = `ed-el ed-${ed.kind}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;

  if (ed.kind === "text") {
    const font: React.CSSProperties = {
      fontFamily: CSS_FONT[ed.family],
      fontSize: ed.size * zoom,
      fontWeight: ed.bold ? 700 : 400,
      fontStyle: ed.italic ? "italic" : "normal",
      lineHeight: LINE_HEIGHT,
      color: ed.color,
    };
    // El "sizer" invisible da el tamaño exacto del texto; el textarea se superpone para escribir.
    const shown = ed.text || (editing ? "Escribe aquí" : "");
    return (
      <div className={cls} style={{ ...pos, ...font }} {...handlers} onDoubleClick={onStartEdit}>
        <span className={`ed-sizer${!ed.text ? " is-placeholder" : ""}`} style={{ visibility: editing && ed.text ? "hidden" : "visible" }}>
          {shown.endsWith("\n") ? shown + " " : shown}
        </span>
        {editing && (
          <textarea
            ref={area}
            className="ed-textarea"
            style={font}
            value={ed.text}
            spellCheck={false}
            onChange={(e) => onText(e.target.value)}
            aria-label="Texto"
          />
        )}
        {handle}
      </div>
    );
  }

  const box: React.CSSProperties = { ...pos, width: ed.w * zoom, height: ed.h * zoom };

  if (ed.kind === "image") {
    return (
      <div className={cls} style={box} {...handlers}>
        {image && <img src={image.url} alt="" draggable={false} />}
        {handle}
      </div>
    );
  }

  if (ed.kind === "path") {
    return (
      <div className={cls} style={box} {...handlers}>
        <SignatureSvg sig={{ ...ed, offsetX: 0, offsetY: 0 }} />
        {handle}
      </div>
    );
  }

  return (
    <div
      className={cls}
      style={{ ...box, background: ed.color, opacity: ed.opacity, mixBlendMode: ed.multiply ? "multiply" : "normal" }}
      {...handlers}
    >
      {handle}
    </div>
  );
}

function DraftView({ draft, zoom, pen, tool }: { draft: Draft; zoom: number; pen: { color: string; width: number }; tool: Tool }) {
  if ("points" in draft) {
    return (
      <svg className="ed-draft" aria-hidden="true">
        <polyline
          points={draft.points.map(([x, y]) => `${x * zoom},${y * zoom}`).join(" ")}
          fill="none"
          stroke={pen.color}
          strokeWidth={pen.width * zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const hl = tool === "highlight";
  return (
    <div
      className="ed-draft-rect"
      style={{
        left: Math.min(draft.x0, draft.x1) * zoom,
        top: Math.min(draft.y0, draft.y1) * zoom,
        width: Math.abs(draft.x1 - draft.x0) * zoom,
        height: Math.abs(draft.y1 - draft.y0) * zoom,
        background: hl ? "rgb(255 225 77 / 0.45)" : "#ffffff",
        mixBlendMode: hl ? "multiply" : "normal",
      }}
    />
  );
}
