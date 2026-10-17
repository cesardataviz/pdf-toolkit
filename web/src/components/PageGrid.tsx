import { useState } from "react";

export interface PageItem {
  id: string;
  source: number; // índice del PDF de origen
  index: number; // página dentro de ese PDF (base 0)
  rotate: number;
  thumb: string | null;
}

interface Props {
  pages: PageItem[];
  sourceNames: string[];
  onChange: (pages: PageItem[]) => void;
}

// Colores para distinguir de qué PDF viene cada página cuando se combinan varios.
const SOURCE_COLORS = ["#08B8EE", "#7C5CFF", "#F5A524", "#17C964", "#F31260", "#0B6E8C"];

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Al girar 90°/270° la página queda apaisada: se reduce para que quepa entera en el recuadro vertical.
export default function PageGrid({ pages, sourceNames, onChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const multi = sourceNames.length > 1;

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = pages.findIndex((p) => p.id === dragId);
    const to = pages.findIndex((p) => p.id === targetId);
    onChange(move(pages, from, to));
  }

  return (
    <ol className="page-grid" aria-label="Páginas del documento final. Arrastra para cambiar el orden.">
      {pages.map((p, i) => (
        <li
          key={p.id}
          className={`page-card${dragId === p.id ? " is-dragging" : ""}${overId === p.id ? " is-over" : ""}`}
          draggable
          onDragStart={(e) => {
            setDragId(p.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(p.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(p.id);
            setOverId(null);
          }}
        >
          <div className="page-thumb">
            {p.thumb ? (
              <img src={p.thumb} alt="" style={{ transform: `rotate(${p.rotate}deg)${p.rotate % 180 ? " scale(0.75)" : ""}` }} draggable={false} />
            ) : (
              <span className="page-loading" aria-hidden="true" />
            )}
            {multi && (
              <span
                className="page-source"
                style={{ background: SOURCE_COLORS[p.source % SOURCE_COLORS.length] }}
                title={sourceNames[p.source]}
              />
            )}
          </div>
          <div className="page-meta">
            <span className="page-num">{i + 1}</span>
            <span className="page-actions">
              <button
                type="button"
                className="mini-button"
                onClick={() => i > 0 && onChange(move(pages, i, i - 1))}
                disabled={i === 0}
                aria-label={`Mover la página ${i + 1} antes`}
                title="Mover antes"
              >
                ←
              </button>
              <button
                type="button"
                className="mini-button"
                onClick={() => i < pages.length - 1 && onChange(move(pages, i, i + 1))}
                disabled={i === pages.length - 1}
                aria-label={`Mover la página ${i + 1} después`}
                title="Mover después"
              >
                →
              </button>
              <button
                type="button"
                className="mini-button"
                onClick={() => onChange(pages.map((x) => (x.id === p.id ? { ...x, rotate: (x.rotate + 90) % 360 } : x)))}
                aria-label={`Girar la página ${i + 1}`}
                title="Girar 90°"
              >
                ⟳
              </button>
              <button
                type="button"
                className="mini-button mini-danger"
                onClick={() => onChange(pages.filter((x) => x.id !== p.id))}
                aria-label={`Quitar la página ${i + 1}`}
                title="Quitar"
              >
                ✕
              </button>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export { SOURCE_COLORS };
