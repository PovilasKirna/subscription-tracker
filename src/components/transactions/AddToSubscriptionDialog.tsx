"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, PlusIcon, RepeatIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CADENCE_LABEL, fullDate, money } from "@/lib/format";
import { useAssign } from "@/lib/query/mutations";
import { assignOptionsQuery } from "@/lib/query/options";
import type { AssignTarget, RelatedTransaction, TransactionItem } from "@/lib/types";

type Target = { key: string | null; name: string };

/**
 * Two steps: pick the subscription a payment belongs to (or start a new one), then optionally
 * bring along other payments to the same merchant — e.g. the charges after a plan upgrade.
 */
export function AddToSubscriptionDialog({ tx, onOpenChange }: { tx: TransactionItem; onOpenChange: (open: boolean) => void }) {
  const { data, error, refetch, isFetching } = useQuery(assignOptionsQuery(tx.id));
  const assign = useAssign();
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Payments already counted in the chosen subscription have nothing to add.
  const related = target ? (data?.related ?? []).filter((r) => !target.key || r.subscriptionKey !== target.key) : [];

  const submit = (to: Target, extra: string[]) =>
    assign.mutate(
      { subKey: to.key, txIds: [tx.id, ...extra] },
      {
        onSuccess: ({ key }) => {
          const n = extra.length + 1;
          toast.success(n === 1 ? `Added to ${to.name}` : `Added ${n} payments to ${to.name}`, {
            action: { label: "View", onClick: () => router.push(`/subscriptions?sub=${encodeURIComponent(key)}`) },
          });
          onOpenChange(false);
        },
      },
    );

  const pick = (to: Target) => {
    const candidates = (data?.related ?? []).filter((r) => !to.key || r.subscriptionKey !== to.key);
    if (!candidates.length) return submit(to, []);
    setTarget(to);
    // Same price and not counted anywhere yet: almost certainly the same subscription.
    setChecked(new Set(candidates.filter((r) => r.similar && !r.subscriptionKey).map((r) => r.id)));
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>
            {target ? "Add similar payments too?" : tx.subscriptionKey ? "Move to subscription" : "Add to subscription"}
          </DialogTitle>
          <DialogDescription className="truncate">
            {fullDate(tx.date)} · {tx.description} · {money(Math.abs(tx.amount), tx.currency)}
          </DialogDescription>
        </DialogHeader>
        {!data && error ? (
          <div className="flex flex-col items-start gap-3 p-4" role="alert">
            <p className="text-sm text-muted-foreground">Couldn't load your subscriptions: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RotateCcwIcon /> Retry
            </Button>
          </div>
        ) : !data ? (
          <div className="flex flex-col gap-2 p-4" role="status" aria-busy="true" aria-label="Loading subscriptions">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : !target ? (
          <TargetPicker newName={data.newName} targets={data.targets} onPick={pick} disabled={assign.isPending} />
        ) : (
          <RelatedPicker
            target={target}
            related={related}
            checked={checked}
            setChecked={setChecked}
            pending={assign.isPending}
            onBack={() => setTarget(null)}
            onSubmit={() => submit(target, [...checked])}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TargetPicker({
  newName,
  targets,
  onPick,
  disabled,
}: {
  newName: string;
  targets: AssignTarget[];
  onPick: (t: Target) => void;
  disabled: boolean;
}) {
  const same = targets.filter((t) => t.sameMerchant);
  const other = targets.filter((t) => !t.sameMerchant);
  const item = (t: AssignTarget) => (
    <CommandItem
      key={t.key}
      value={`${t.name} ${t.key}`}
      disabled={disabled}
      onSelect={() => onPick({ key: t.key, name: t.name })}
      className="py-2"
    >
      <RepeatIcon className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{t.name}</span>
      <span className="tabular shrink-0 text-xs text-muted-foreground">
        {money(t.amount, t.currency)} · {CADENCE_LABEL[t.cadence]}
      </span>
    </CommandItem>
  );
  return (
    <Command className="rounded-none!">
      <CommandInput placeholder="Search subscriptions…" autoFocus />
      <CommandList className="max-h-80">
        <CommandEmpty>No subscription with that name.</CommandEmpty>
        <CommandGroup>
          <CommandItem value={`new ${newName}`} disabled={disabled} onSelect={() => onPick({ key: null, name: newName })} className="py-2">
            <PlusIcon />
            <span className="min-w-0 flex-1 truncate">
              New subscription <span className="text-muted-foreground">· {newName}</span>
            </span>
          </CommandItem>
        </CommandGroup>
        {same.length > 0 && <CommandGroup heading="Same merchant">{same.map(item)}</CommandGroup>}
        {other.length > 0 && <CommandGroup heading="All subscriptions">{other.map(item)}</CommandGroup>}
      </CommandList>
    </Command>
  );
}

function RelatedPicker({
  target,
  related,
  checked,
  setChecked,
  pending,
  onBack,
  onSubmit,
}: {
  target: Target;
  related: RelatedTransaction[];
  checked: Set<string>;
  setChecked: (next: Set<string>) => void;
  pending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    setChecked(next);
  };
  const allOn = related.every((r) => checked.has(r.id));
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <p className="text-sm text-muted-foreground">
          {related.length === 1 ? "1 other payment" : `${related.length} other payments`} to this merchant could belong to{" "}
          <span className="font-medium text-foreground">{target.name}</span>.
        </p>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={() => setChecked(allOn ? new Set() : new Set(related.map((r) => r.id)))}
        >
          {allOn ? "Clear" : "Select all"}
        </Button>
      </div>
      <ul className="mx-4 mb-4 max-h-80 divide-y overflow-y-auto rounded-lg border">
        {related.map((r) => (
          <li key={r.id}>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: the Checkbox renders the control */}
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
              <Checkbox checked={checked.has(r.id)} onCheckedChange={(on) => toggle(r.id, on)} />
              <span className="tabular w-24 shrink-0 text-muted-foreground">{fullDate(r.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.description}</span>
                {(r.similar || r.subscriptionName) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[r.similar && "Same price", r.subscriptionName && `Now in ${r.subscriptionName}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 font-medium">{money(Math.abs(r.amount), r.currency)}</span>
            </label>
          </li>
        ))}
      </ul>
      <DialogFooter className="m-0 items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeftIcon /> Back
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {checked.size ? `Add ${checked.size + 1} payments` : "Add just this one"}
        </Button>
      </DialogFooter>
    </>
  );
}
