"use client";

import { ListFilterIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type FilterDef, type FilterFacets, type FilterSelection, summarizeFilter } from "./filters";

export type DataTableFilterProps = {
  // biome-ignore lint/suspicious/noExplicitAny: rows are irrelevant to the menu; any row type is accepted
  defs: readonly FilterDef<any>[];
  selection: FilterSelection;
  /** Omit to hide counts. */
  facets?: FilterFacets;
  onChange: (key: string, values: string[]) => void;
};

// biome-ignore lint/suspicious/noExplicitAny: see above
function OptionItems({ def, selection, facets, onChange }: Omit<DataTableFilterProps, "defs"> & { def: FilterDef<any> }) {
  const selected = selection[def.key] ?? [];
  const toggle = (value: string, on: boolean) => onChange(def.key, on ? [...selected, value] : selected.filter((v) => v !== value));
  return def.options.map((o) => {
    const count = facets?.[def.key]?.[o.value];
    const Icon = o.icon;
    return (
      <DropdownMenuCheckboxItem
        key={o.value}
        checked={selected.includes(o.value)}
        onCheckedChange={(on) => toggle(o.value, Boolean(on))}
        disabled={count === 0 && !selected.includes(o.value)}
      >
        {Icon && <Icon />}
        {o.label}
        {count !== undefined && <span className="tabular ml-auto pl-3 text-xs text-muted-foreground">{count.toLocaleString("en-GB")}</span>}
      </DropdownMenuCheckboxItem>
    );
  });
}

/** "Filter" button: one submenu per dimension, multi-select with live counts. */
export function DataTableFilterMenu(props: DataTableFilterProps) {
  const active = props.defs.filter((d) => props.selection[d.key]?.length).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <ListFilterIcon /> Filter
        {active > 0 && (
          <Badge variant="secondary" className="tabular ml-0.5 h-4.5 min-w-4.5 rounded-full px-1 text-xs">
            {active}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filter by</DropdownMenuLabel>
          {props.defs.map((def) => (
            <DropdownMenuSub key={def.key}>
              <DropdownMenuSubTrigger>
                <def.icon /> {def.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-60">
                <OptionItems {...props} def={def} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One chip per active filter: click to change values, ✕ to remove. */
export function DataTableFilterChips(props: DataTableFilterProps) {
  return props.defs
    .filter((def) => props.selection[def.key]?.length)
    .map((def) => (
      <div key={def.key} className="inline-flex h-7 max-w-full min-w-0 items-center overflow-hidden rounded-md border bg-muted/40 text-xs">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex h-full min-w-0 items-center gap-1.5 px-2 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
                aria-label={`Edit ${def.label} filter`}
              />
            }
          >
            <def.icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-muted-foreground">{def.label}:</span>
            <span className="truncate font-medium">{summarizeFilter(def, props.selection[def.key])}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <OptionItems {...props} def={def} />
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => props.onChange(def.key, [])}
          className="flex h-full shrink-0 items-center border-l px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          aria-label={`Remove ${def.label} filter`}
        >
          <XIcon className="size-3" />
        </button>
      </div>
    ));
}
