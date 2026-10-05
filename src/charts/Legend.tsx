import { type Paint, seriesColor } from "./palette";

export type LegendItem = { key: string; label: string; color: Paint };

/** Always shown for 2+ series so identity never depends on colour alone. */
export function Legend({ items }: { items: readonly LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-secondary)]">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(it.color) }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
