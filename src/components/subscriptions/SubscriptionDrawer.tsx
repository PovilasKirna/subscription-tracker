"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleXIcon,
  HandCoinsIcon,
  MinusCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusCircleIcon,
  RotateCcwIcon,
  SparklesIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { type ReactNode, Suspense, useState } from "react";
import { toast } from "sonner";
import { ChargeHistory } from "@/charts";
import { MerchantIcon } from "@/components/MerchantIcon";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CADENCE_LABEL, fullDate, money, monthYearLabel, relativeDays } from "@/lib/format";
import { useAssign, useExclusion, useOverride, useReimbursement } from "@/lib/query/mutations";
import { subscriptionDetailQuery } from "@/lib/query/options";
import { expectedFor } from "@/lib/reimbursement";
import { CADENCES, subscriptionDrawerParams } from "@/lib/search-params";
import type { Cadence, RelatedTransaction, Subscription, TransactionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./ColorPicker";
import { ReimbursedNote, ReimbursementAmountDialog, ReimbursementSection, reimbursementToast } from "./Reimbursement";
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
              <LogoPicker subKey={subKey} name={s.name} website={s.website} chosen={s.websiteChosen} />
              <ColorPicker subKey={subKey} name={s.name} color={s.color} chosen={s.colorChosen} />
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
                <CadencePicker sub={s} />
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
              <Stat label="Per month">
                {fmt(s.netMonthlyCost)}
                {s.reimbursement && (
                  <span className="block text-xs font-normal text-muted-foreground">{fmt(s.monthlyCost)} before reimbursement</span>
                )}
              </Stat>
              <Stat label="Per year">{fmt(s.reimbursement ? s.netMonthlyCost * 12 : s.yearlyCost)}</Stat>
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
              <Stat label="Spent so far">
                {/* Net of what came back (recorded + assumed); the gross underneath when they differ. */}
                {fmt(s.totalSpent - s.totalReimbursed)}
                {s.totalReimbursed > 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">{fmt(s.totalSpent)} before reimbursement</span>
                )}
              </Stat>
              <Stat label="Since">
                {fullDate(s.firstCharge)}
                <span className="block text-xs font-normal text-muted-foreground">{s.chargeCount} charges</span>
              </Stat>
            </dl>

            <ReimbursementSection sub={s} transactions={data.transactions} today={data.today} ignored={data.ignored} />

            <section>
              <h3 className="mb-2 text-sm font-medium">Charge history</h3>
              <ChargeHistory
                charges={s.charges}
                color={s.color}
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
  const reimbursement = useReimbursement();
  const [editing, setEditing] = useState<TransactionItem | null>(null);
  const reimburse = (tx: TransactionItem, amount: number | null) =>
    reimbursement.mutate({ txId: tx.id, amount }, { onSuccess: () => toast.success(reimbursementToast(amount, tx.currency)) });
  const run = (tx: TransactionItem) =>
    exclusion.mutate(
      { txId: tx.id, exclude: action === "exclude" },
      { onSuccess: () => toast.success(action === "exclude" ? "Charge removed from this subscription" : "Charge added back") },
    );
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{hint}</p>}
      <ul className={cn("mt-2 divide-y rounded-lg border", muted && "text-muted-foreground")}>
        {items.map((tx) => (
          <li key={tx.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tabular w-24 shrink-0 text-muted-foreground">{fullDate(tx.date)}</span>
            <span className={cn("min-w-0 flex-1 truncate", muted && "line-through")}>{tx.description}</span>
            <span className="tabular shrink-0 text-right font-medium">
              {money(Math.abs(tx.amount), tx.currency)}
              <ReimbursedNote tx={tx} />
            </span>
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
                  <>
                    {tx.reimbursement && <ReimbursementItems tx={tx} onRecord={reimburse} onOther={() => setEditing(tx)} />}
                    <DropdownMenuItem variant="destructive" onClick={() => run(tx)}>
                      <MinusCircleIcon /> Remove from subscription
                    </DropdownMenuItem>
                  </>
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
      {editing && <ReimbursementAmountDialog tx={editing} onOpenChange={(open) => !open && setEditing(null)} />}
    </section>
  );
}

/** A charge's reimbursement actions: record the expected amount, another amount, nothing, or clear it. */
function ReimbursementItems({
  tx,
  onRecord,
  onOther,
}: {
  tx: TransactionItem;
  onRecord: (tx: TransactionItem, amount: number | null) => void;
  onOther: () => void;
}) {
  const r = tx.reimbursement;
  if (!r) return null;
  const expected = expectedFor(tx);
  const recorded = r.status === "recorded";
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Reimbursement</DropdownMenuLabel>
        {expected !== null && expected > 0 && !(recorded && r.amount === expected) && (
          <DropdownMenuItem onClick={() => onRecord(tx, expected)}>
            <HandCoinsIcon /> Reimbursed {money(expected, tx.currency)}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onOther}>
          <PencilIcon /> {expected !== null ? "Reimbursed another amount…" : "Mark as reimbursed…"}
        </DropdownMenuItem>
        {r.status !== "none" && !(recorded && r.amount === 0) && (
          <DropdownMenuItem onClick={() => onRecord(tx, 0)}>
            <BanIcon /> Not reimbursed
          </DropdownMenuItem>
        )}
        {recorded && (
          <DropdownMenuItem onClick={() => onRecord(tx, null)}>
            <CircleXIcon /> Clear what you recorded
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
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

/**
 * How often it renews. Detection needs two charges to tell, so a lone one is shown as a guess
 * the user can correct; picking "Automatic" hands it back to detection.
 */
function CadencePicker({ sub }: { sub: Pick<Subscription, "key" | "name" | "cadence" | "cadenceChosen" | "chargeCount"> }) {
  const override = useOverride();
  const guessed = !sub.cadenceChosen && sub.chargeCount < 2;
  const pick = (value: string) => {
    const cadence = value === "auto" ? null : (value as Cadence);
    if (cadence === (sub.cadenceChosen ? sub.cadence : null)) return;
    override.mutate(
      { key: sub.key, cadence },
      { onSuccess: () => toast.success(cadence ? `Renews ${CADENCE_LABEL[cadence].toLowerCase()}` : "Renewal set to automatic") },
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="-mx-2 font-normal text-muted-foreground data-popup-open:bg-muted"
            disabled={override.isPending}
            aria-label={`Renews ${CADENCE_LABEL[sub.cadence].toLowerCase()}${guessed ? " (guessed)" : ""}. Change how often ${sub.name} renews`}
          />
        }
      >
        {CADENCE_LABEL[sub.cadence]}
        {guessed && <span className="text-muted-foreground/70">(guessed)</span>}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Renews</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sub.cadenceChosen ? sub.cadence : "auto"} onValueChange={(v) => pick(String(v))}>
            <DropdownMenuRadioItem value="auto">
              <SparklesIcon /> Automatic
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {CADENCES.map((c) => (
              <DropdownMenuRadioItem key={c} value={c}>
                {CADENCE_LABEL[c]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The logo beside the name; click it to set the website the logo comes from (or go back to the built-in one). */
function LogoPicker({ subKey, name, website, chosen }: { subKey: string; name: string; website: string | null; chosen: boolean }) {
  const override = useOverride();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const save = (next: string) =>
    override.mutate(
      { key: subKey, website: next },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(next ? "Logo updated" : "Logo reset");
        },
      },
    );
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(chosen ? (website ?? "") : "");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="shrink-0 rounded-lg outline-none ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Logo for ${name}${website ? ` from ${website}` : ""}. Change logo`}
            title="Change logo"
          />
        }
      >
        <MerchantIcon name={name} website={website} size="lg" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Logo</PopoverTitle>
          <PopoverDescription className="text-xs">The service&apos;s website. Its icon is used as the logo.</PopoverDescription>
        </PopoverHeader>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save(value.trim());
          }}
        >
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={(!chosen && website) || "example.com"}
            className="h-8"
            aria-label="Website"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" size="icon-sm" disabled={override.isPending || !value.trim()} aria-label="Save website">
            <CheckIcon />
          </Button>
        </form>
        {chosen && (
          <Button variant="outline" size="sm" disabled={override.isPending} onClick={() => save("")}>
            <RotateCcwIcon /> Reset logo
          </Button>
        )}
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
