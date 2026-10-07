"use client";

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Signed money, direction shown by icon and sign as well as colour (never colour alone). */
export function Delta({
  value,
  currency,
  pct,
  cents = true,
  moreIsBad,
  icon,
}: {
  value: number;
  currency: string;
  pct?: number | null;
  cents?: boolean;
  moreIsBad?: boolean;
  icon?: boolean;
}) {
  const up = value > 0.005;
  const down = value < -0.005;
  const sign = up ? "+" : down ? "−" : "±";
  const good = moreIsBad ? down : up;
  const bad = moreIsBad ? up : down;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums",
        good && "text-[var(--delta-good)]",
        bad && "text-[var(--delta-bad)]",
      )}
    >
      {icon && (up || down) && <Icon className="size-3.5" aria-hidden />}
      {sign}
      {money(Math.abs(value), currency, { cents })}
      {pct != null && Number.isFinite(pct) && ` (${sign}${Math.abs(pct * 100).toFixed(1)}%)`}
    </span>
  );
}

/** A signed percentage with the same colour/sign rules as Delta. */
export function Percent({ value, digits = 1 }: { value: number; digits?: number }) {
  const up = value > 0.00005;
  const down = value < -0.00005;
  return (
    <span className={cn("font-medium tabular-nums", up && "text-[var(--delta-good)]", down && "text-[var(--delta-bad)]")}>
      {up ? "+" : down ? "−" : ""}
      {Math.abs(value * 100).toFixed(digits)}%
    </span>
  );
}

export type Range = { id: string; label: string; days: number | "ytd" | null };

/** The last `days` days of a daily series (null = all; "ytd" = since 1 January). */
export function sliceRange<T extends { date: string }>(data: readonly T[], range: Range, today: string): T[] {
  if (range.days === null) return [...data];
  if (range.days === "ytd") return data.filter((d) => d.date >= `${today.slice(0, 4)}-01-01`);
  return data.slice(-(range.days + 1));
}

export function RangeToggle({ ranges, value, onChange }: { ranges: readonly Range[]; value: string; onChange: (id: string) => void }) {
  return (
    <ToggleGroup variant="outline" size="sm" value={[value]} onValueChange={(v: string[]) => v[0] && onChange(v[0])} aria-label="Range">
      {ranges.map((r) => (
        <ToggleGroupItem key={r.id} value={r.id} className="px-2 text-xs">
          {r.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
