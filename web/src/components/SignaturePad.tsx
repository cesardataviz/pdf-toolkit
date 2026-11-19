import { useEffect, useRef, useState } from "react";
import { strokesToPath, type Point, type VectorPath } from "../lib/paths";

export interface Signature extends VectorPath {
  color: string;
}

const STORE = "pdf_toolkit_firmas";
const INKS = [
  ["#0b0b0b", "Negro"],
  ["#1a3fb0", "Azul"],
] as const;

function loadSaved(): Signature[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function storeSaved(list: Signature[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* sin almacenamiento: la firma sirve igual, solo no se recuerda */
  }
}

export function SignatureSvg({ sig, className }: { sig: Signature; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${sig.vbW} ${sig.vbH}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={sig.d} fill="none" stroke={sig.color} strokeWidth={sig.stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  onPick: (sig: Signature) => void;
  onClose: () => void;
}

/** Diálogo para dibujar una firma (se guarda como trazo vectorial, no como imagen) o elegir una guardada. */
export default function SignaturePad({ onPick, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const [hasInk, setHasInk] = useState(false);
  const [color, setColor] = useState<string>(INKS[0][0]);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<Signature[]>(loadSaved);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function redraw() {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    if (c.width !== Math.round(width * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
  }

  useEffect(redraw, [color]);

  const point = (e: React.PointerEvent): Point => {
    const rect = canvas.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  function clear() {
    strokes.current = [];
    setHasInk(false);
    redraw();
  }

  function accept() {
    const path = strokesToPath(strokes.current, 2.6);
    if (!path) return;
    const sig: Signature = { ...path, color };
    if (remember) {
      const next = [sig, ...saved].slice(0, 4);
      setSaved(next);
      storeSaved(next);
    }
    onPick(sig);
  }

  function forget(i: number) {
    const next = saved.filter((_, j) => j !== i);
    setSaved(next);
    storeSaved(next);
  }

  return (
    <dialog ref={dialog} className="sig-dialog" onClose={onClose} aria-labelledby="sig-title">
      <div className="sig-head">
        <h2 id="sig-title" className="sig-title">Tu firma</h2>
        <button type="button" className="mini-button" onClick={() => dialog.current?.close()} aria-label="Cerrar">
          ✕
        </button>
      </div>

      {saved.length > 0 && (
        <div className="sig-saved">
          <p className="field-label">Firmas guardadas en este navegador</p>
          <div className="sig-saved-list">
            {saved.map((s, i) => (
              <div key={i} className="sig-saved-item">
                <button type="button" className="sig-saved-pick" onClick={() => onPick(s)} aria-label={`Usar la firma ${i + 1}`}>
                  <SignatureSvg sig={s} />
                </button>
                <button type="button" className="mini-button mini-danger" onClick={() => forget(i)} aria-label={`Olvidar la firma ${i + 1}`} title="Olvidar">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="field-label">Dibuja con el mouse, el dedo o un lápiz</p>
      <canvas
        ref={canvas}
        className="sig-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          strokes.current.push([point(e)]);
          setHasInk(true);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const s = strokes.current[strokes.current.length - 1];
          const p = point(e);
          const prev = s[s.length - 1];
          if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1.5) return; // ignora micro-movimientos
          s.push(p);
          redraw();
        }}
      />

      <div className="sig-options">
        <div className="sig-inks" role="radiogroup" aria-label="Color de tinta">
          {INKS.map(([hex, label]) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={color === hex}
              className="swatch"
              style={{ background: hex }}
              onClick={() => setColor(hex)}
              aria-label={label}
              title={label}
            />
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Recordar en este navegador
        </label>
      </div>

      <div className="sig-actions">
        <button type="button" className="button button-ghost" onClick={clear} disabled={!hasInk}>
          Borrar
        </button>
        <button type="button" className="button button-primary" onClick={accept} disabled={!hasInk}>
          Usar firma
        </button>
      </div>
    </dialog>
  );
}
