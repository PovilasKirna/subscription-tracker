"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { BellIcon, ChevronRightIcon, CircleAlertIcon, Loader2Icon, PlusIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { type SourceInput, useDeleteReimbursementPeriod, useDeleteSource, useSaveSource } from "@/lib/query/mutations";
import { reimbursementSourcesQuery } from "@/lib/query/options";
import { MODE_LABEL, ordinal, periodStartLabel } from "@/lib/reimbursement";
import type { ReimbursementSource } from "@/lib/types";
import { DEFAULT_SOURCE_INPUT, SourceFields, validSource } from "./SourceFields";

// Where reimbursements come from: one tile per source plus an "Add source" tile. Self-contained
// (fetches its own data) so a settings page only has to mount it inside a <Suspense> with
// <SourcesSkeleton /> as the fallback.

/** "Netflix, Claude and 2 more". */
const listNames = (names: string[], max = 3) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

export function SourcesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="status" aria-busy="true" aria-label="Loading reimbursement sources">
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}

export function SourcesManager() {
  const { data } = useSuspenseQuery(reimbursementSourcesQuery());
  // null = closed, "new" = adding, otherwise the id of the source being edited (looked up in the
  // fresh list so the dialog follows changes, e.g. periods removed from it).
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const edited = typeof editing === "number" ? data.sources.find((s) => s.id === editing) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {!data.sources.length && (
        <p className="text-sm text-muted-foreground">
          No sources yet. Add where reimbursements come from, like your salary or an insurer, then pick it when you set up a
          subscription&apos;s reimbursement.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.sources.map((s) => (
          <li key={s.id}>
            <SourceTile source={s} onOpen={() => setEditing(s.id)} />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex h-full min-h-28 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/20 text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            <PlusIcon className="size-4" aria-hidden /> Add source
          </button>
        </li>
      </ul>
      {(editing === "new" || edited) && (
        <SourceDialog key={editing} source={edited ?? null} onOpenChange={(open) => !open && setEditing(null)} />
      )}
    </div>
  );
}

function SourceTile({ source: s, onOpen }: { source: ReimbursementSource; onOpen: () => void }) {
  const Icon = s.mode === "request" ? BellIcon : ZapIcon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full min-h-28 w-full items-start gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-[background-color,box-shadow] outline-none hover:bg-muted/40 hover:ring-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
      aria-label={`${s.name}, ${MODE_LABEL[s.mode].toLowerCase()}. Edit`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{s.name}</span>
        <span className="text-xs text-muted-foreground">
          {MODE_LABEL[s.mode]}
          {s.reminderDay !== null && ` · reminder on the ${ordinal(s.reminderDay)}`}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          {s.subscriptions.length ? `Used by ${listNames(s.subscriptions.map((u) => u.name))}` : "Not used yet"}
        </span>
        {s.pending > 0 && (
          <span className="mt-1 flex items-center gap-1 text-xs">
            <CircleAlertIcon className="size-3.5 text-[var(--status-warning)]" aria-hidden />
            {s.pending} pending
          </span>
        )}
      </span>
      <ChevronRightIcon
        className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}

/** Add (`source` null) or edit a source; editing also offers deleting it while nothing uses it. */
export function SourceDialog({
  source,
  onOpenChange,
  onSaved,
}: {
  source: ReimbursementSource | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: number) => void;
}) {
  const save = useSaveSource();
  const formId = useId();
  const [value, setValue] = useState<SourceInput>(
    source ? { name: source.name, mode: source.mode, reminderDay: source.reminderDay } : { ...DEFAULT_SOURCE_INPUT, name: "" },
  );
  const valid = validSource(value);
  return (
    <Dialog open onOpenChange={(open) => !save.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{source ? `Edit ${source.name}` : "Add a reimbursement source"}</DialogTitle>
          <DialogDescription>Where money for your subscriptions comes back from, like your salary or an insurer.</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(
              { ...value, name: value.name.trim(), id: source?.id },
              {
                onSuccess: (res) => {
                  toast.success(source ? "Source saved" : `${value.name.trim()} added`);
                  onSaved?.(res.id);
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <SourceFields value={value} onChange={setValue} autoFocus={!source} />
        </form>
        {source && <DeleteSource source={source} onDeleted={() => onOpenChange(false)} />}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {source ? "Save" : "Add source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Danger zone: delete, or explain which subscriptions still use the source. */
function DeleteSource({ source, onDeleted }: { source: ReimbursementSource; onDeleted: () => void }) {
  const remove = useDeleteSource();
  const [confirm, setConfirm] = useState(false);
  if (source.subscriptions.length) return <SourceInUse source={source} />;
  return (
    <AlertDialog open={confirm} onOpenChange={(open) => !remove.isPending && setConfirm(open)}>
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-destructive-text hover:text-destructive-text"
        onClick={() => setConfirm(true)}
      >
        <Trash2Icon /> Delete source
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {source.name}?</AlertDialogTitle>
          <AlertDialogDescription>No subscription uses it, so nothing else changes.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(source.id, {
                onSuccess: () => {
                  toast.success(`${source.name} deleted`);
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

type PeriodRef = { id: number; startsOn: string; name: string };

/** Why a source can't be deleted yet: every period from it, each removable right here. */
function SourceInUse({ source }: { source: ReimbursementSource }) {
  const remove = useDeleteReimbursementPeriod();
  const [removing, setRemoving] = useState<PeriodRef | null>(null);
  const periods: PeriodRef[] = source.subscriptions.flatMap((u) => u.periods.map((p) => ({ ...p, name: u.name })));
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <p>
        Can&apos;t be deleted while {listNames(source.subscriptions.map((u) => u.name))}{" "}
        {source.subscriptions.length === 1 ? "has" : "have"} reimbursement periods from it. Remove them first:
      </p>
      <ul className="mt-1.5 flex flex-col">
        {periods.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-foreground">
              {p.name} <span className="text-muted-foreground">· from {periodStartLabel(p.startsOn)}</span>
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-destructive-text"
              onClick={() => setRemoving(p)}
              aria-label={`Remove ${p.name}'s period from ${periodStartLabel(p.startsOn)}`}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this period?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing &&
                `${removing.name}'s charges from ${periodStartLabel(removing.startsOn)} fall back to the period before it, or to ordinary spend if there is none. Amounts you recorded for charges stay.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.success("Period removed");
                    setRemoving(null);
                  },
                })
              }
            >
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              {remove.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
