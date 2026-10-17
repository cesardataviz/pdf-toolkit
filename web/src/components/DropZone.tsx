import { useRef, useState } from "react";

interface Props {
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

export default function DropZone({ title, hint, accept, multiple = true, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length) onFiles(multiple ? list : list.slice(0, 1));
  }

  return (
    <div
      className={`dropzone${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
    >
      <span className="dropzone-pixels" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <svg className="dropzone-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M13 6h15l9 9v27H13z" />
        <path d="M28 6v9h9" />
        <path d="M25 37V24m-5 5 5-5 5 5" />
      </svg>
      <p className="dropzone-title">{title}</p>
      <p className="dropzone-or">o</p>
      <button type="button" className="button button-secondary" onClick={() => input.current?.click()}>
        {multiple ? "Elegir archivos" : "Elegir archivo"}
      </button>
      <p className="dropzone-hint">{hint}</p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
