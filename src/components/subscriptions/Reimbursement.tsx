"use client";

import { useQuery } from "@tanstack/react-query";
import { BellIcon, CircleAlertIcon, HandCoinsIcon, Loader2Icon, PencilIcon, Trash2Icon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SOURCE_INPUT, SourceFields, validSource } from "@/components/reimbursements/SourceFields";
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
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fullDate, money } from "@/lib/format";
import { type SourceInput, useDeleteReimbursementPeriod, useReimbursement, useReimbursementPeriod } from "@/lib/query/mutations";
import { reimbursementSourcesQuery } from "@/lib/query/options";
import { charged, expectedFor, MODE_LABEL, parseAmount, periodStartLabel, reimbursementToast, startOptions } from "@/lib/reimbursement";
import type { ReimbursementPeriod, Subscription, TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// A subscription's reimbursement: periods say who pays back how much per charge from which month;
// each charge then shows what came back (recorded), what's assumed (automatic sources) or that a
// request is still pending.

/** The first period that starts after `date` (periods are newest first), if any. */
const periodAfter = (sub: Subscription, date: string) => sub.reimbursementPeriods.findLast((p) => p.startsOn > date);

export { reimbursementToast } from "@/lib/reimbursement";

/**
 * The drawer's reimbursement section: current period, pending charges and period history. For an
 * ignored subscription only the history is left, so periods from before can still be removed.
 */
export function ReimbursementSection({
  sub,
  transactions,
  today,
  ignored = false,
}: {
  sub: Subscription;
  transactions: TransactionItem[];
  today: string;
  ignored?: boolean;
}) {
  const [dialog, setDialog] = useState(false);
  if (ignored) {
    if (!sub.reimbursementPeriods.length) return null;
    return (
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Reimbursement</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ignored subscriptions aren&apos;t reimbursed. Remove these periods if you no longer need them.
          </p>
        </div>
        <PeriodHistory sub={sub} today={today} />
      </section>
    );
  }
  const fmt = (n: number) => money(n, sub.currency);
  const current = sub.reimbursement;
  const latest = sub.reimbursementPeriods[0];
  // Set up, but its first charge is still to come.
  const upcoming = current ? undefined : periodAfter(sub, today);
  const pending = transactions.filter((t) => t.reimbursement?.status === "pending");
  let summary: string;
  if (current?.source) {
    summary = `${fmt(current.amount)} back per charge from ${current.source.name} · ${MODE_LABEL[current.source.mode].toLowerCase()}`;
  } else if (upcoming?.source) {
    summary = `Starts ${periodStartLabel(upcoming.startsOn)}: ${fmt(upcoming.amount)} back per charge from ${upcoming.source.name} · ${MODE_LABEL[upcoming.source.mode].toLowerCase()}`;
  } else if (latest && !latest.source && latest.startsOn <= today) {
    summary = `Not reimbursed since ${periodStartLabel(latest.startsOn)}.`;
  } else {
    summary = "Paid back to you, e.g. with your salary? Set how much comes back per charge, and from when.";
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Reimbursement</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary}
            {sub.totalReimbursed > 0 && ` · ${fmt(sub.totalReimbursed)} reimbursed so far`}
          </p>
        </div>
        <Button variant="outline" size="xs" className="shrink-0" onClick={() => setDialog(true)}>
          {current || upcoming?.source ? <PencilIcon /> : <HandCoinsIcon />}
          {current || upcoming?.source ? "Change" : "Set up"}
        </Button>
      </div>
      {pending.length > 0 && <PendingCallout items={pending} />}
      {sub.reimbursementPeriods.length > 0 && <PeriodHistory sub={sub} today={today} />}
      {dialog && <PeriodDialog sub={sub} today={today} onOpenChange={setDialog} />}
    </section>
  );
}

/** Every charge still waiting for its reimbursement, each one click from settled. */
function PendingCallout({ items }: { items: TransactionItem[] }) {
  const record = useReimbursement();
  const mark = (tx: TransactionItem, amount: number) =>
    record.mutate({ txId: tx.id, amount }, { onSuccess: () => toast.success(reimbursementToast(amount, tx.currency)) });
  return (
    <div className="rounded-lg border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <CircleAlertIcon className="size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
        {items.length === 1 ? "1 reimbursement pending" : `${items.length} reimbursements pending`}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">Nothing recorded yet. Did they come through?</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((tx) => {
          const amount = expectedFor(tx) ?? 0;
          return (
            <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="tabular min-w-0 flex-1">
                {fullDate(tx.date)} <span className="text-muted-foreground">· {money(charged(tx), tx.currency)}</span>
              </span>
              <span className="flex gap-1.5">
                <Button size="xs" disabled={record.isPending} onClick={() => mark(tx, amount)}>
                  Got {money(amount, tx.currency)}
                </Button>
                <Button size="xs" variant="outline" disabled={record.isPending} onClick={() => mark(tx, 0)}>
                  Not reimbursed
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Small list of periods, newest first, each removable (e.g. one set up by mistake). */
function PeriodHistory({ sub, today }: { sub: Subscription; today: string }) {
  const [removing, setRemoving] = useState<ReimbursementPeriod | null>(null);
  const remove = useDeleteReimbursementPeriod();
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground">Periods</h4>
      <ul className="mt-1 divide-y rounded-lg border text-sm">
        {sub.reimbursementPeriods.map((p) => {
          const Icon = p.source?.mode === "automatic" ? ZapIcon : BellIcon;
          return (
            <li key={p.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
              <span className="tabular w-24 shrink-0 text-muted-foreground">{periodStartLabel(p.startsOn)}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {p.source ? (
                  <>
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={MODE_LABEL[p.source.mode]} />
                    <span className="truncate">
                      {money(p.amount, sub.currency)} from {p.source.name}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Stopped</span>
                )}
                {p.startsOn > today && <span className="text-xs text-muted-foreground">(upcoming)</span>}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setRemoving(p)}
                aria-label={`Remove the period from ${periodStartLabel(p.startsOn)}`}
              >
                <Trash2Icon />
              </Button>
            </li>
          );
        })}
      </ul>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this period?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing &&
                `Charges from ${periodStartLabel(removing.startsOn)} fall back to the period before it, or to ordinary spend if there is none. Amounts you recorded for charges stay.`}
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

const NEW_SOURCE = "new";

/** Set up or change the reimbursement from a chosen month, or stop it from then. */
function PeriodDialog({ sub, today, onOpenChange }: { sub: Subscription; today: string; onOpenChange: (open: boolean) => void }) {
  const sources = useQuery(reimbursementSourcesQuery());
  const save = useReimbursementPeriod();
  const id = useId();
  const current = sub.reimbursement;
  // What a change starts from: the period in force, else one that hasn't started yet.
  const base = current ?? periodAfter(sub, today) ?? null;
  // Not started yet: changing it keeps its start unless another one is picked.
  const plannedStart = !current && base ? base.startsOn : null;
  const options = startOptions(
    sub.charges.map((c) => c.date),
    today,
    sub.nextCharge,
  );
  if (plannedStart && !options.some((o) => o.value === plannedStart)) {
    options.unshift({ value: plannedStart, label: periodStartLabel(plannedStart), hint: "as planned" });
  }
  // A first setup starts at the latest charge's month (so it counts); anything later applies to the next charge.
  const first = sub.reimbursementPeriods.length === 0;
  const [startsOn, setStartsOn] = useState(first ? `${sub.lastCharge.slice(0, 7)}-01` : (plannedStart ?? options[0].value));
  const [amount, setAmount] = useState(String(base?.source ? base.amount : sub.amount));
  const [picked, setPicked] = useState<string | null>(base?.source ? String(base.source.id) : null);
  const [edited, setNewSource] = useState<SourceInput | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const list = sources.data?.sources ?? [];
  // The very first source is offered as "Salary"; with others around, a new one starts blank.
  const newSource = edited ?? (list.length ? { ...DEFAULT_SOURCE_INPUT, name: "" } : DEFAULT_SOURCE_INPUT);
  // Until the user picks: the current source, else the first one, else a new (default "Salary") one.
  const sourceValue = picked ?? (list[0] ? String(list[0].id) : NEW_SOURCE);
  const creating = sourceValue === NEW_SOURCE;
  const value = parseAmount(amount);
  // Nothing is decided while the sources load: the default would otherwise be a new "Salary".
  const valid = !sources.isPending && value !== null && value > 0 && (!creating || validSource(newSource));
  const startLabel = options.find((o) => o.value === startsOn)?.label ?? fullDate(startsOn);
  // A later period still takes over from its own start, whatever is saved here.
  const later = periodAfter(sub, startsOn);
  const sourceItems = {
    ...Object.fromEntries(list.map((s) => [String(s.id), s.name])),
    [NEW_SOURCE]: "New source…",
  };

  const submit = (stop: boolean) => {
    if (!stop && (!valid || value === null)) return;
    save.mutate(
      stop
        ? { subKey: sub.key, startsOn, stop: true }
        : {
            subKey: sub.key,
            startsOn,
            amount: value as number,
            ...(creating ? { newSource: { ...newSource, name: newSource.name.trim() } } : { sourceId: Number(sourceValue) }),
          },
      {
        onSuccess: () => {
          toast.success(stop ? `Not reimbursed from ${startLabel}` : base?.source ? "Reimbursement changed" : "Reimbursement set up");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !save.isPending && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{base?.source ? "Change reimbursement" : "Set up reimbursement"}</DialogTitle>
          <DialogDescription>
            {base?.source
              ? "Changes apply from the date you pick; earlier charges keep what they had."
              : `What you get back for ${sub.name}. It's taken off the monthly cost, and each charge shows whether it came back.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label id={`${id}-source`}>Paid back by</Label>
            <Select items={sourceItems} value={sourceValue} onValueChange={(v) => v && setPicked(String(v))}>
              <SelectTrigger className="w-full" aria-labelledby={`${id}-source`} disabled={sources.isPending}>
                <SelectValue placeholder={sources.isPending ? "Loading…" : undefined} />
              </SelectTrigger>
              <SelectContent>
                {list.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                    <span className="text-xs text-muted-foreground">{MODE_LABEL[s.mode]}</span>
                  </SelectItem>
                ))}
                {list.length > 0 && <SelectSeparator />}
                <SelectItem value={NEW_SOURCE}>New source…</SelectItem>
              </SelectContent>
            </Select>
            {sources.error ? (
              <span className="text-xs text-destructive">{sources.error.message}</span>
            ) : (
              <Link
                href="/settings/reimbursements"
                className="w-fit text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                Manage sources
              </Link>
            )}
          </div>
          {creating && !sources.isPending && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <SourceFields value={newSource} onChange={setNewSource} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-amount`}>Back per charge ({sub.currency})</Label>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && !(value !== null && value > 0)}
            />
            <span className="text-xs text-muted-foreground">
              Price is {money(sub.amount, sub.currency)}. Never more than a charge is counted.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id={`${id}-start`}>Starting from</Label>
            <Select
              items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
              value={startsOn}
              onValueChange={(v) => v && setStartsOn(String(v))}
            >
              <SelectTrigger className="w-full" aria-labelledby={`${id}-start`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    <span className="text-xs text-muted-foreground">{o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {later
                ? `Applies only until ${periodStartLabel(later.startsOn)}, when the later ${later.source ? `change (${money(later.amount, sub.currency)} from ${later.source.name})` : "stop"} takes over. `
                : ""}
              Charges before the first period are ordinary spend. Pick an earlier month to include past charges.
            </span>
          </div>
        </form>
        <DialogFooter className="sm:justify-between">
          {current ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={save.isPending}
              onClick={() => setConfirmStop(true)}
            >
              Stop from {startLabel}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`${id}-form`} disabled={!valid || save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
        <AlertDialog open={confirmStop} onOpenChange={(open) => !save.isPending && setConfirmStop(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Stop reimbursing {sub.name} from {startLabel}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Charges from then on are ordinary spend: nothing pending or assumed for them. Amounts you recorded stay.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={save.isPending}>Keep reimbursing</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={save.isPending} onClick={() => submit(true)}>
                {save.isPending && <Loader2Icon className="animate-spin" />}
                {save.isPending ? "Stopping…" : "Stop reimbursing"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** Small line under a charge's amount saying what came back for it. */
export function ReimbursedNote({ tx }: { tx: TransactionItem }) {
  const r = tx.reimbursement;
  if (!r || r.status === "none") return null;
  const amount = money(r.amount, tx.currency);
  if (r.status === "pending") {
    return (
      <span className="mt-0.5 ml-auto flex w-fit items-center gap-1 rounded-full bg-[var(--status-warning)]/15 px-1.5 text-[11px] font-medium text-foreground">
        <CircleAlertIcon className="size-3 text-[var(--status-warning)]" aria-hidden /> Pending
      </span>
    );
  }
  if (r.status === "assumed") {
    return (
      <span className="tabular block text-xs font-normal text-muted-foreground" title="Paid automatically; assumed until you say otherwise">
        −{amount} assumed
      </span>
    );
  }
  return r.amount > 0 ? (
    <span className="tabular block text-xs font-normal text-[var(--delta-good)]">−{amount} back</span>
  ) : (
    <span className="block text-xs font-normal text-muted-foreground">Not reimbursed</span>
  );
}

/** Enter any amount (up to the charge) that came back for one charge. */
export function ReimbursementAmountDialog({ tx, onOpenChange }: { tx: TransactionItem; onOpenChange: (open: boolean) => void }) {
  const record = useReimbursement();
  const id = useId();
  const r = tx.reimbursement;
  const max = charged(tx);
  const [value, setValue] = useState(String(r?.status === "recorded" ? r.amount : (expectedFor(tx) ?? max)));
  const amount = parseAmount(value);
  const valid = amount !== null && amount >= 0 && amount <= max;
  return (
    <Dialog open onOpenChange={(open) => !record.isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reimbursed amount</DialogTitle>
          <DialogDescription>
            For the {money(max, tx.currency)} charge on {fullDate(tx.date)}. Enter 0 if it won&apos;t be reimbursed.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            record.mutate(
              { txId: tx.id, amount },
              {
                onSuccess: () => {
                  toast.success(reimbursementToast(amount, tx.currency));
                  onOpenChange(false);
                },
              },
            );
          }}
          className="flex flex-col gap-1.5"
        >
          <Label htmlFor={id}>Amount ({tx.currency})</Label>
          <Input
            id={id}
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={value !== "" && !valid}
          />
          <span className={cn("text-xs", !valid && value !== "" ? "text-destructive" : "text-muted-foreground")}>
            Between 0 and {money(max, tx.currency)}.
          </span>
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={record.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!valid || record.isPending}>
            {record.isPending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
