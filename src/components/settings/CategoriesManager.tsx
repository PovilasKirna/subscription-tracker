"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, Loader2Icon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PRESET_COLORS, seriesColor } from "@/charts/palette";
import { CATEGORY_ICONS, CategoryGlyph } from "@/components/spending/CategoryIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BUILTIN_CATEGORIES,
  CATEGORY_ICON_NAMES,
  CATEGORY_KINDS,
  type Category,
  type CategoryIconName,
  type CategoryId,
  type CategoryKind,
  canHide,
  HIDDEN_FALLBACK,
  isBuiltinCategoryId,
  KIND_HINT,
  KIND_LABEL,
  MAX_CATEGORY_NAME,
  NO_CATEGORY_COLOR,
} from "@/lib/categories";
import { useDeleteCategory, useSaveCategory } from "@/lib/query/mutations";
import { categoryUsageQuery } from "@/lib/query/options";
import { useCategories } from "@/lib/query/useCategories";
import type { CategoryUsagePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

// Settings → Categories: every category grouped by what it counts as, with an add/edit dialog.
// Built-ins can be renamed, recoloured and (most of them) hidden; the user's own can also change
// kind and be deleted.

type Usage = CategoryUsagePayload["usage"][string];
const NO_USAGE: Usage = { payments: 0, merchants: 0, picked: 0 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The icon a new category starts with, by kind. */
const KIND_ICON: Record<CategoryKind, CategoryIconName> = {
  spend: "shapes",
  income: "circle-dollar-sign",
  savings: "piggy-bank",
  internal: "arrow-left-right",
};

const ADD_LABEL: Record<CategoryKind, string> = {
  spend: "Add a spending category",
  income: "Add an income category",
  savings: "Add a savings category",
  internal: "Add a category that isn't counted",
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

export function CategoriesSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading categories">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-72" />
      <Skeleton className="h-32" />
    </div>
  );
}

export function CategoriesManager() {
  const categories = useCategories();
  const { data } = useSuspenseQuery(categoryUsageQuery());
  // null = closed, a kind = adding one of that kind, otherwise the id being edited (looked up in the
  // fresh list, so the dialog follows saves).
  const [editing, setEditing] = useState<{ id: CategoryId } | { kind: CategoryKind } | null>(null);
  const edited = editing && "id" in editing ? categories.byId.get(editing.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Payments are sorted into the built-in categories automatically. To use one of your own, pick it from a payment&apos;s category
          menu, for that payment or every payment from the merchant.
        </p>
        <Button size="sm" onClick={() => setEditing({ kind: "spend" })}>
          <PlusIcon /> Add category
        </Button>
      </div>
      {CATEGORY_KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`kind-${kind}`} className="flex flex-col gap-2">
          <div>
            <h3 id={`kind-${kind}`} className="text-sm font-medium">
              {KIND_LABEL[kind]}
            </h3>
            <p className="text-[12.5px] text-muted-foreground">{KIND_HINT[kind]}</p>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {categories.list
              .filter((c) => c.kind === kind)
              .map((c) => (
                <CategoryItem
                  key={c.id}
                  category={c}
                  usage={data.usage[c.id] ?? NO_USAGE}
                  fallback={categories.of(HIDDEN_FALLBACK[c.kind]).label}
                  onEdit={() => setEditing({ id: c.id })}
                />
              ))}
            <li>
              <button
                type="button"
                onClick={() => setEditing({ kind })}
                className={cn(
                  focusRing,
                  "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:-outline-offset-2",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-foreground/20">
                  <PlusIcon className="size-4" aria-hidden />
                </span>
                {ADD_LABEL[kind]}
              </button>
            </li>
          </ul>
        </section>
      ))}
      {editing && ("kind" in editing || edited) && (
        <CategoryDialog
          key={"id" in editing ? editing.id : `new-${editing.kind}`}
          category={edited ?? null}
          initialKind={"kind" in editing ? editing.kind : (edited?.kind ?? "spend")}
          usage={(edited && data.usage[edited.id]) ?? NO_USAGE}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}

/** "48 payments · 3 merchants", or why a hidden one is empty. */
function usageLine(c: Category, usage: Usage, fallback: string): string {
  if (c.hidden) return `Hidden · its payments are in ${fallback}`;
  const parts = [plural(usage.payments, "payment")];
  if (usage.merchants) parts.push(plural(usage.merchants, "merchant"));
  const original = isBuiltinCategoryId(c.id) ? BUILTIN_CATEGORIES[c.id].label : null;
  if (original && original !== c.label) parts.push(`was ${original}`);
  return parts.join(" · ");
}

function CategoryItem({
  category: c,
  usage,
  fallback,
  onEdit,
}: {
  category: Category;
  usage: Usage;
  fallback: string;
  onEdit: () => void;
}) {
  const save = useSaveCategory();
  const toggleHidden = () =>
    save.mutate(
      { id: c.id, hidden: !c.hidden },
      {
        onSuccess: () =>
          toast.success(c.hidden ? `${c.label} is back` : `${c.label} hidden`, {
            description: c.hidden ? undefined : `Its payments are in ${fallback} until you show it again.`,
          }),
        onError: (e) => toast.error(e.message),
      },
    );
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          focusRing,
          "group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-4 text-left transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2",
        )}
        aria-label={`${c.label}. Edit`}
      >
        <CategoryGlyph icon={c.icon} color={c.color} className={cn(c.hidden && "opacity-50")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", c.hidden && "text-muted-foreground")}>{c.label}</span>
          <span className="block truncate text-[12.5px] text-muted-foreground">{usageLine(c, usage, fallback)}</span>
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
      {canHide(c.id) && (
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 size-11 shrink-0 text-muted-foreground"
          disabled={save.isPending}
          onClick={toggleHidden}
          aria-label={c.hidden ? `Show ${c.label}` : `Hide ${c.label}`}
          title={c.hidden ? "Show" : "Hide"}
        >
          {save.isPending ? <Loader2Icon className="animate-spin" /> : c.hidden ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      )}
    </li>
  );
}

type Draft = { name: string; kind: CategoryKind; icon: CategoryIconName; color: number };

/** Add (`category` null) or edit a category. */
function CategoryDialog({
  category,
  initialKind,
  usage,
  onOpenChange,
}: {
  category: Category | null;
  initialKind: CategoryKind;
  usage: Usage;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveCategory();
  const formId = useId();
  const builtIn = category && isBuiltinCategoryId(category.id) ? BUILTIN_CATEGORIES[category.id] : null;
  const [draft, setDraft] = useState<Draft>(
    category
      ? { name: category.label, kind: category.kind, icon: category.icon, color: category.color ?? NO_CATEGORY_COLOR }
      : { name: "", kind: initialKind, icon: KIND_ICON[initialKind], color: NO_CATEGORY_COLOR },
  );
  const [error, setError] = useState<string | null>(null);
  const name = draft.name.trim();
  const valid = (name.length > 0 || builtIn !== null) && name.length <= MAX_CATEGORY_NAME;
  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const isDefault =
    builtIn !== null &&
    (name === "" || name === builtIn.label) &&
    draft.icon === builtIn.icon &&
    draft.color === (builtIn.color ?? NO_CATEGORY_COLOR);

  return (
    <Dialog open onOpenChange={(open) => !save.isPending && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CategoryGlyph icon={draft.icon} color={draft.color || null} />
            <div className="min-w-0">
              <DialogTitle className="truncate">{category ? `Edit ${category.label}` : "Add a category"}</DialogTitle>
              <DialogDescription>
                {builtIn ? "Built in: payments are sorted into it automatically." : "Your own: holds the payments you put in it."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              {
                id: category?.id,
                name,
                ...(!builtIn && { kind: draft.kind }),
                icon: draft.icon,
                color: draft.color,
              },
              {
                onSuccess: () => {
                  toast.success(category ? "Category saved" : `${name} added`);
                  onOpenChange(false);
                },
                onError: (err) => setError(err.message),
              },
            );
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <Input
              id={`${formId}-name`}
              autoFocus={!category}
              value={draft.name}
              maxLength={MAX_CATEGORY_NAME}
              placeholder={builtIn?.label ?? "Emergency fund"}
              onChange={(e) => set({ name: e.target.value })}
              aria-invalid={error !== null || undefined}
            />
          </div>
          <KindField value={draft.kind} onChange={(kind) => set({ kind })} locked={builtIn !== null} />
          <IconField value={draft.icon} color={draft.color} onChange={(icon) => set({ icon })} />
          <ColorField value={draft.color} onChange={(color) => set({ color })} />
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {error}
            </p>
          )}
        </form>
        {builtIn && !isDefault && (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => set({ name: builtIn.label, icon: builtIn.icon, color: builtIn.color ?? NO_CATEGORY_COLOR })}
          >
            <RotateCcwIcon /> Back to the original name and look
          </Button>
        )}
        {category && !builtIn && <DeleteCategory category={category} usage={usage} onDeleted={() => onOpenChange(false)} />}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {category ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindField({ value, onChange, locked }: { value: CategoryKind; onChange: (k: CategoryKind) => void; locked: boolean }) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={locked}>
      <legend className="mb-1.5 text-sm leading-none font-medium">Counts as</legend>
      <div className="grid grid-cols-2 gap-2">
        {CATEGORY_KINDS.map((kind) => {
          const checked = value === kind;
          return (
            <label
              key={kind}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid has-focus-visible:outline-ring",
                checked && "border-primary bg-primary/5 hover:bg-primary/5",
                locked && "cursor-default hover:bg-transparent",
                locked && !checked && "opacity-50",
              )}
            >
              <input type="radio" name={name} value={kind} checked={checked} onChange={() => onChange(kind)} className="sr-only" />
              <span className="text-sm font-medium">{KIND_LABEL[kind]}</span>
            </label>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {locked ? "A built-in category keeps its kind: automatic sorting relies on it." : KIND_HINT[value]}
      </span>
    </fieldset>
  );
}

const swatchClass = cn(
  focusRing,
  "grid place-items-center rounded-md transition-shadow hover:ring-2 hover:ring-ring/40 aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover",
);

function IconField({ value, color, onChange }: { value: CategoryIconName; color: number; onChange: (i: CategoryIconName) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm leading-none font-medium">Icon</legend>
      <div className="grid grid-cols-7 gap-1 sm:grid-cols-8">
        {CATEGORY_ICON_NAMES.map((name) => {
          const Icon = CATEGORY_ICONS[name];
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={selected}
              aria-label={name.replace(/-/g, " ")}
              title={name.replace(/-/g, " ")}
              onClick={() => onChange(name)}
              className={cn(swatchClass, "aspect-square min-h-9 text-muted-foreground hover:bg-muted aria-pressed:text-foreground")}
              style={selected && color ? { color: seriesColor(color) } : undefined}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// Design-tool "no fill": the background struck through with a red diagonal (as the subscription colour picker).
const NO_COLOR_BG =
  "linear-gradient(to top right, transparent calc(50% - 1px), var(--destructive) calc(50% - 1px), var(--destructive) calc(50% + 1px), transparent calc(50% + 1px)), var(--background)";

function ColorField({ value, onChange }: { value: number; onChange: (c: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm leading-none font-medium">Colour</legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={value === NO_CATEGORY_COLOR}
          aria-label="No colour"
          title="No colour"
          onClick={() => onChange(NO_CATEGORY_COLOR)}
          className={cn(swatchClass, "size-8 ring-1 ring-border ring-inset")}
          style={{ background: NO_COLOR_BG }}
        />
        {PRESET_COLORS.map((c) => (
          <button
            key={c.slot}
            type="button"
            aria-pressed={value === c.slot}
            aria-label={c.label}
            title={c.label}
            onClick={() => onChange(c.slot)}
            className={cn(swatchClass, "size-8")}
            style={{ background: seriesColor(c.slot) }}
          >
            {value === c.slot && <CheckIcon className="size-4 text-white" aria-hidden />}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Tints its icon, and marks it in bars and breakdowns.</span>
    </fieldset>
  );
}

/** What deleting does to the payments in it, in a sentence. */
function deleteConsequence(usage: Usage): string {
  const choices = usage.merchants + usage.picked;
  if (!usage.payments && !choices) return "Nothing is in it, so nothing else changes.";
  const rules = [usage.merchants && plural(usage.merchants, "merchant"), usage.picked && plural(usage.picked, "single payment")]
    .filter(Boolean)
    .join(" and ");
  const payments = usage.payments
    ? `Its ${plural(usage.payments, "payment")} ${usage.payments === 1 ? "goes" : "go"} back to being sorted automatically, and your`
    : "Your";
  return `${payments} choices for ${rules} are removed. This can't be undone.`;
}

function DeleteCategory({ category, usage, onDeleted }: { category: Category; usage: Usage; onDeleted: () => void }) {
  const remove = useDeleteCategory();
  const [confirm, setConfirm] = useState(false);
  return (
    <AlertDialog open={confirm} onOpenChange={(open) => !remove.isPending && setConfirm(open)}>
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-destructive-text hover:text-destructive-text"
        onClick={() => setConfirm(true)}
      >
        <Trash2Icon /> Delete category
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {category.label}?</AlertDialogTitle>
          <AlertDialogDescription>{deleteConsequence(usage)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(category.id, {
                onSuccess: () => {
                  toast.success(`${category.label} deleted`);
                  setConfirm(false);
                  onDeleted();
                },
              })
            }
          >
            {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            {remove.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
