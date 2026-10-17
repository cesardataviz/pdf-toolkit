/**
 * Interpreta rangos de páginas escritos por una persona: "1-3, 5, 8-10".
 * Devuelve grupos de índices base 0. Cada grupo separado por coma es un grupo distinto
 * (útil para "un PDF por grupo"); para "extraer" se unen todos.
 */
export function parseRanges(text: string, total: number): number[][] {
  const parts = text
    .split(/[,;]/)
    .map((p) => p.replace(/\s+/g, ""))
    .filter(Boolean);
  if (parts.length === 0) throw new Error("Escribe qué páginas quieres, por ejemplo: 1-3, 5");

  return parts.map((part) => {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`"${part}" no es un rango válido. Usa números y guiones: 1-3, 5`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < 1) throw new Error("Las páginas empiezan en 1.");
    if (from > total || to > total) throw new Error(`El documento tiene ${total} páginas.`);
    if (to < from) throw new Error(`En "${part}" el inicio es mayor que el final.`);
    return Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  });
}
