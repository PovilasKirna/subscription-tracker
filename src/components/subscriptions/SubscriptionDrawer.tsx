"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  MinusCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusCircleIcon,
  SparklesIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { type ReactNode, Suspense, useState } from "react";
import { toast } from "sonner";
import { ChargeHistory, type ColorSlot, PRESET_COLORS, slotColor } from "@/charts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CADENCE_LABEL, fullDate, money, monthYearLabel, relativeDays } from "@/lib/format";
import { useAssign, useExclusion, useOverride } from "@/lib/query/mutations";
import { subscriptionDetailQuery } from "@/lib/query/options";
import { subscriptionDrawerParams } from "@/lib/search-params";
import type { RelatedTransaction, TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { SubscriptionActions } from "./SubscriptionActions";

/**
 * Detail drawer for one subscription, opened by `?sub=<key>` (deep-linkable from any page).
 * Mount it once per page; it reads and clears the URL param itself.
 */
export function SubscriptionDrawer() {
  const [key, setKey] = useQueryState("sub", subscriptionDrawerParams.sub);
  return (
    <Drawer open={Boolean(key)} onOpenChange={(open) => !open && void setKey(null)} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:38rem]">
        {key && (
          <Suspense fallback={<DetailSkeleton />}>
            <SubscriptionDetail subKey={key} />
          </Suspense>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SubscriptionDetail({ subKey }: { subKey: string }) {
  const { data } = useSuspenseQuery(subscriptionDetailQuery(subKey));
  const s = data.subscription;
  const fmt = (n: number) => money(n, s?.currency ?? data.baseCurrency);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawerHeader className="flex-row items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          {s ? (
            <div className="flex items-center gap-2">
              <ColorPicker subKey={subKey} name={s.name} slot={s.colorSlot} chosen={s.colorChosen} />
              <div className="min-w-0 flex-1">
                <EditableName subKey={subKey} name={s.name} />
              </div>
            </div>
          ) : (
            <DrawerTitle>Not a subscription anymore</DrawerTitle>
          )}
          <DrawerDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {s && (
              <>
                <span>{s.category}</span>
                <span>{CADENCE_LABEL[s.cadence]}</span>
                <StatusBadge status={data.ignored ? "ignored" : s.status} />
              </>
            )}
          </DrawerDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {s && <SubscriptionActions sub={{ ...s, rowStatus: data.ignored ? "ignored" : s.status }} />}
          <DrawerClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <XIcon />
          </DrawerClose>
        </div>
      </DrawerHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 select-text">
        {s ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Price">{fmt(s.amount)}</Stat>
              <Stat label="Per month">{fmt(s.monthlyCost)}</Stat>
              <Stat label="Per year">{fmt(s.yearlyCost)}</Stat>
              <Stat label="Next charge">
                {s.nextCharge ? (
                  <>
                    {fullDate(s.nextCharge)}
                    <span className="block text-xs font-normal text-muted-foreground">{relativeDays(s.nextCharge, data.today)}</span>
                  </>
                ) : (
                  "—"
                )}
              </Stat>
              <Stat label="Spent so far">{fmt(s.totalSpent)}</Stat>
              <Stat label="Since">
                {fullDate(s.firstCharge)}
                <span className="block text-xs font-normal text-muted-foreground">{s.chargeCount} charges</span>
              </Stat>
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-medium">Charge history</h3>
              <ChargeHistory
                charges={s.charges}
                slot={s.colorSlot}
                formatValue={fmt}
                formatAxisValue={(n) => money(n, s.currency, { cents: false })}
                formatDate={fullDate}
                formatTick={(d) => monthYearLabel(d.slice(0, 7))}
              />
            </section>

            {s.priceChanges.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium">Price changes</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {s.priceChanges.map((pc) => (
                    <li key={pc.date} className="flex items-center gap-2">
                      <TrendingUpIcon
                        className={cn("size-4", pc.to > pc.from ? "text-[var(--delta-bad)]" : "rotate-180 text-[var(--delta-good)]")}
                      />
                      <span className="text-muted-foreground">{fullDate(pc.date)}</span>
                      <span className="tabular ml-auto">
                        {fmt(pc.from)} → <b className="font-medium">{fmt(pc.to)}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            After removing charges, the rest no longer form a recurring pattern. Put charges back below if that was a mistake.
          </p>
        )}

        <ChargeList
          title={`Charges (${data.transactions.length})`}
          hint="Remove anything that isn't part of this subscription, like a one-off transfer to the same card."
          items={data.transactions}
          action="exclude"
        />
        {s && data.related.length > 0 && <RelatedList subKey={subKey} name={s.name} items={data.related} />}
        {data.excluded.length > 0 && (
          <ChargeList title={`Removed from this subscription (${data.excluded.length})`} items={data.excluded} action="include" muted />
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 font-semibold">{children}</dd>
    </div>
  );
}

function ChargeList({
  title,
  hint,
  items,
  action,
  muted,
}: {
  title: string;
  hint?: string;
  items: TransactionItem[];
  action: "exclude" | "include";
  muted?: boolean;
}) {
  const exclusion = useExclusion();
  const run = (tx: TransactionItem) =>
    exclusion.mutate(
      { txId: tx.id, exclude: action === "exclude" },
      { onSuccess: () => toast.success(action === "exclude" ? "Charge removed from this subscription" : "Charge added back") },
    );
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{hint}</p>}
      <ul className={cn("mt-2 divide-y rounded-lg border", muted && "opacity-70")}>
        {items.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tabular w-24 shrink-0 text-muted-foreground">{fullDate(tx.date)}</span>
            <span className={cn("min-w-0 flex-1 truncate", muted && "line-through")}>{tx.description}</span>
            <span className="tabular shrink-0 font-medium">{money(Math.abs(tx.amount), tx.currency)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Actions for charge on ${fullDate(tx.date)}`} />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {action === "exclude" ? (
                  <DropdownMenuItem variant="destructive" onClick={() => run(tx)}>
                    <MinusCircleIcon /> Remove from subscription
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => run(tx)}>
                    <PlusCircleIcon /> Include again
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {!items.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No charges.</li>}
      </ul>
    </section>
  );
}

/** Same-merchant payments that aren't counted here, each one click away from being added. */
function RelatedList({ subKey, name, items }: { subKey: string; name: string; items: RelatedTransaction[] }) {
  const assign = useAssign();
  const add = (txs: RelatedTransaction[]) =>
    assign.mutate(
      { subKey, txIds: txs.map((t) => t.id) },
      { onSuccess: () => toast.success(txs.length === 1 ? `Added to ${name}` : `Added ${txs.length} payments to ${name}`) },
    );
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Other payments to this merchant ({items.length})</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Not counted here. Add the ones that belong to this subscription, like charges after a plan change.
          </p>
        </div>
        {items.length > 1 && (
          <Button variant="outline" size="xs" className="shrink-0" disabled={assign.isPending} onClick={() => add(items)}>
            <PlusCircleIcon /> Add all
          </Button>
        )}
      </div>
      <ul className="mt-2 divide-y rounded-lg border">
        {items.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tabular w-24 shrink-0 text-muted-foreground">{fullDate(tx.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{tx.description}</span>
              {(tx.similar || tx.subscriptionName) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {[tx.similar && "Same price", tx.subscriptionName && `Now in ${tx.subscriptionName}`].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            <span className="tabular shrink-0 font-medium">{money(Math.abs(tx.amount), tx.currency)}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              disabled={assign.isPending}
              onClick={() => add([tx])}
              aria-label={`Add charge on ${fullDate(tx.date)} to ${name}`}
            >
              <PlusCircleIcon />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Swatch beside the name; picks one of the preset chart colours, or hands it back to automatic. */
function ColorPicker({ subKey, name, slot, chosen }: { subKey: string; name: string; slot: ColorSlot; chosen: boolean }) {
  const override = useOverride();
  const [open, setOpen] = useState(false);
  const current = chosen ? PRESET_COLORS.find((c) => c.slot === slot) : undefined;
  const pick = (colorSlot: number | null) => {
    setOpen(false);
    if (colorSlot === (chosen ? slot : null)) return;
    override.mutate(
      { key: subKey, colorSlot },
      { onSuccess: () => toast.success(colorSlot ? "Colour updated" : "Colour set to automatic") },
    );
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label={`Colour for ${name}: ${current?.label ?? "automatic"}. Change colour`}
          />
        }
      >
        <span className="size-3.5 rounded-[4px]" style={{ background: slotColor(slot) }} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <PopoverHeader>
          <PopoverTitle>Colour</PopoverTitle>
          <PopoverDescription className="text-xs">Marks this subscription in the table and its own chart series.</PopoverDescription>
        </PopoverHeader>
        <fieldset className="grid grid-cols-4 gap-1.5" aria-label="Preset colours">
          {PRESET_COLORS.map((c) => {
            const selected = chosen && c.slot === slot;
            return (
              <button
                key={c.slot}
                type="button"
                aria-pressed={selected}
                aria-label={c.label}
                title={c.label}
                disabled={override.isPending}
                onClick={() => pick(c.slot)}
                className="grid size-8 place-items-center rounded-md outline-none ring-offset-2 ring-offset-popover transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ background: slotColor(c.slot) }}
              >
                {selected && <CheckIcon className="size-4 text-white" aria-hidden />}
              </button>
            );
          })}
        </fieldset>
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

function EditableName({ subKey, name }: { subKey: string; name: string }) {
  const override = useOverride();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const save = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name)
      override.mutate({ key: subKey, displayName: value.trim() }, { onSuccess: () => toast.success("Renamed") });
  };
  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <DrawerTitle className="truncate text-lg">{name}</DrawerTitle>
        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)} aria-label="Rename">
          <PencilIcon />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DrawerTitle className="sr-only">{name}</DrawerTitle>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="h-8"
        aria-label="Subscription name"
      />
      <Button type="submit" size="icon-sm" aria-label="Save name">
        <CheckIcon />
      </Button>
    </form>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4" role="status" aria-busy="true" aria-label="Loading subscription">
      <div className="flex flex-col gap-2 border-b pb-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-48" />
    </div>
  );
}
