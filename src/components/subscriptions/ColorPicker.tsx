"use client";

import { CheckIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { PRESET_COLORS, type SeriesColor, seriesColor } from "@/charts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { type ColorChoice, type HexColor, isHexColor } from "@/lib/color";
import { useOverride } from "@/lib/query/mutations";
import { cn } from "@/lib/utils";

const FALLBACK_CUSTOM: HexColor = "#2a78d6";

/** Expands the `#rgb` shorthand the hex input accepts to `#rrggbb`. */
const expandHex = (c: string) => (c.length === 4 ? `#${[...c.slice(1)].map((d) => d + d).join("")}` : c);

// Design-tool "no fill": the background struck through with a red diagonal.
const NO_COLOR_BG =
  "linear-gradient(to top right, transparent calc(50% - 1px), var(--destructive) calc(50% - 1px), var(--destructive) calc(50% + 1px), transparent calc(50% + 1px)), var(--background)";
const RAINBOW_BG = "conic-gradient(from 180deg, #e34948, #eda100, #1baf7a, #2a78d6, #4a3aa7, #e87ba4, #e34948)";

const swatchClass =
  "grid size-8 place-items-center rounded-md outline-none ring-offset-2 ring-offset-popover transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground disabled:opacity-50";

/** What the user has chosen; null = automatic. */
function currentChoice(color: SeriesColor, chosen: boolean): ColorChoice | null {
  if (!chosen) return null;
  return color ?? "none";
}

function describe(choice: ColorChoice | null): string {
  if (choice === null) return "automatic";
  if (choice === "none") return "none";
  if (typeof choice === "number") return PRESET_COLORS.find((c) => c.slot === choice)?.label ?? `colour ${choice}`;
  return `custom ${choice}`;
}

/** Black or white, whichever has the higher WCAG contrast on `hex` (they tie at luminance ~0.179). */
function checkColorOn(hex: HexColor): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "text-black" : "text-white";
}

/** The hex a palette slot currently renders as (theme-aware), to seed the custom picker. */
function resolvedHex(color: SeriesColor): HexColor {
  if (isHexColor(color)) return color;
  if (typeof color !== "number" || typeof document === "undefined") return FALLBACK_CUSTOM;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--series-${color}`).trim();
  return isHexColor(value) ? value : FALLBACK_CUSTOM;
}

/** A swatch showing a subscription's colour, struck through when the user chose "none". */
export function ColorSwatch({ color, none, className }: { color: SeriesColor; none?: boolean; className?: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-[3px]", none && "ring-1 ring-border ring-inset", className)}
      style={{ background: none ? NO_COLOR_BG : seriesColor(color) }}
      aria-hidden
    />
  );
}

/** Swatch beside the name: a preset chart colour, a custom one, none, or back to automatic. */
export function ColorPicker({ subKey, name, color, chosen }: { subKey: string; name: string; color: SeriesColor; chosen: boolean }) {
  const override = useOverride();
  const [open, setOpen] = useState(false);
  const current = currentChoice(color, chosen);
  const isCustom = isHexColor(current);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HexColor>(FALLBACK_CUSTOM);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setEditing(isCustom);
      setDraft(resolvedHex(color));
    }
  };

  const pick = (choice: ColorChoice | null) => {
    setOpen(false);
    const same = isHexColor(choice) && isHexColor(current) ? choice.toLowerCase() === current.toLowerCase() : choice === current;
    if (same) return;
    const message = choice === null ? "Colour set to automatic" : choice === "none" ? "Colour removed" : "Colour updated";
    override.mutate({ key: subKey, color: choice }, { onSuccess: () => toast.success(message) });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label={`Colour for ${name}: ${describe(current)}. Change colour`}
          />
        }
      >
        <ColorSwatch color={color} none={current === "none"} className="size-3.5 rounded-[4px]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[15.5rem]">
        <PopoverHeader>
          <PopoverTitle>Colour</PopoverTitle>
          <PopoverDescription className="text-xs">Marks this subscription in the table and its own chart series.</PopoverDescription>
        </PopoverHeader>
        <fieldset className="grid grid-cols-5 gap-1.5" aria-label="Colours">
          {PRESET_COLORS.map((c) => {
            const selected = current === c.slot;
            return (
              <button
                key={c.slot}
                type="button"
                aria-pressed={selected}
                aria-label={c.label}
                title={c.label}
                disabled={override.isPending}
                onClick={() => pick(c.slot)}
                className={swatchClass}
                style={{ background: seriesColor(c.slot) }}
              >
                {selected && <CheckIcon className="size-4 text-white" aria-hidden />}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={current === "none"}
            aria-label="No colour"
            title="No colour — grey, grouped into “Other” on the chart"
            disabled={override.isPending}
            onClick={() => pick("none")}
            className={cn(swatchClass, "ring-1 ring-border ring-inset")}
            style={{ background: NO_COLOR_BG }}
          />
          <button
            type="button"
            aria-pressed={isCustom}
            aria-expanded={editing}
            aria-label={isCustom ? `Custom colour ${current}` : "Custom colour"}
            title="Custom colour"
            disabled={override.isPending}
            onClick={() => setEditing((e) => !e)}
            className={swatchClass}
            style={{ background: isCustom ? current : RAINBOW_BG }}
          >
            {isCustom && <CheckIcon className={cn("size-4", checkColorOn(current))} aria-hidden />}
          </button>
        </fieldset>
        {editing && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              pick(draft);
            }}
          >
            <HexColorPicker
              color={draft}
              onChange={(c) => isHexColor(c) && setDraft(c)}
              style={{ width: "100%", height: 132 }}
              aria-label="Custom colour"
            />
            <div className="flex items-center gap-1.5">
              <span className="size-8 shrink-0 rounded-md ring-1 ring-border ring-inset" style={{ background: draft }} aria-hidden />
              <HexColorInput
                color={draft}
                onChange={(c) => {
                  const hex = expandHex(c);
                  if (isHexColor(hex)) setDraft(hex);
                }}
                prefixed
                aria-label="Hex colour"
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 font-mono text-sm uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring dark:bg-input/30"
              />
              <Button type="submit" size="sm" disabled={override.isPending}>
                Apply
              </Button>
            </div>
          </form>
        )}
        <Button
          variant={chosen ? "outline" : "secondary"}
          size="sm"
          disabled={override.isPending}
          onClick={() => pick(null)}
          aria-pressed={!chosen}
        >
          <SparklesIcon /> Automatic
        </Button>
      </PopoverContent>
    </Popover>
  );
}
