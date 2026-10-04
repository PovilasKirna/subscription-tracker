"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  LandmarkIcon,
  Link2Icon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UnlinkIcon,
  XIcon,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MerchantIcon } from "@/components/MerchantIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { type ConnectionTone, connectionStatus, historyGap, needsReconnect, sessionHealth, timeAgo } from "@/lib/bank";
import { fullDate, shortDate } from "@/lib/format";
import { useInvalidateAll, useResetAll } from "@/lib/query/mutations";
import { api, keys, statusQuery } from "@/lib/query/options";
import { dataParams } from "@/lib/search-params";
import type { BankAccount, BankSession, DataStatusPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SYNC_TOAST_ID } from "./SyncWatcher";

const COUNTRIES = {
  LT: "Lithuania",
  LV: "Latvia",
  EE: "Estonia",
  PL: "Poland",
  DE: "Germany",
  IE: "Ireland",
  FR: "France",
  ES: "Spain",
  NL: "Netherlands",
  GB: "United Kingdom",
};
type Country = keyof typeof COUNTRIES;
type SyncResult = { inserted: number; updated: number; skipped: number; errors: string[] };
type Aspsp = { name: string; country: string };

const TONE_COLOR: Record<ConnectionTone, string> = {
  syncing: "var(--series-1)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Sends the browser to the bank's consent page (then back to /api/bank/callback). */
function useConnect() {
  return useMutation({
    mutationFn: (bank: Aspsp) => api<{ url: string }>("/api/bank/connect", { method: "POST", body: JSON.stringify(bank) }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => toast.error(e.message),
  });
}

function useSyncNow() {
  const resetAll = useResetAll();
  return useMutation({
    mutationFn: () => api<SyncResult>("/api/bank/sync", { method: "POST" }),
    onSuccess: (s) => {
      if (s.errors.length) toast.warning("Sync finished with problems", { id: SYNC_TOAST_ID, description: s.errors.join("\n") });
      else toast.success(s.inserted ? `${s.inserted} new transactions` : "Already up to date", { id: SYNC_TOAST_ID });
      void resetAll();
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Bank logo where we know the bank's website, else a generic bank glyph. */
function BankLogo({ name, size = "lg" }: { name: string; size?: "md" | "lg" }) {
  const website = /revolut/i.test(name) ? "revolut.com" : null;
  if (website) return <MerchantIcon name={name} website={website} size={size} />;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-muted text-muted-foreground ring-1 ring-border",
        size === "lg" ? "size-10 rounded-lg" : "size-7 rounded-md",
      )}
    >
      <LandmarkIcon className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  );
}

function StatusDot({ tone }: { tone: ConnectionTone }) {
  return tone === "syncing" ? (
    <Loader2Icon className="size-3 animate-spin" style={{ color: TONE_COLOR[tone] }} aria-hidden />
  ) : (
    <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: TONE_COLOR[tone] }} />
  );
}

/** Bank connections: one tile per connection, the "+ Add connection" tile, and the detail sheet. */
export function Connections() {
  const { data } = useSuspenseQuery(statusQuery());
  const [{ bank, reason }, setParams] = useQueryStates(dataParams);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // The bank callback lands here with ?bank=connected|error.
  useEffect(() => {
    if (bank === "connected") toast.success("Bank connected", { description: "Importing your transaction history…" });
    if (bank === "error") toast.error("Couldn't connect the bank", { description: reason ?? undefined });
    if (bank) void setParams({ bank: null, reason: null });
  }, [bank, reason, setParams]);

  if (!data.bankConfigured) return <SetupCard hours={data.syncIntervalHours} />;

  const open = data.sessions.find((s) => s.sessionId === openId) ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank connections</CardTitle>
        <CardDescription>
          New transactions are pulled every {Math.max(6, data.syncIntervalHours)}h. Bank access lasts up to 180 days, then you reconnect in
          one click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {data.sessions.map((s) => (
            <li key={s.sessionId}>
              <ConnectionTile session={s} onOpen={() => setOpenId(s.sessionId)} />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex size-full min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed p-4 text-center text-sm text-muted-foreground opacity-70 outline-none transition-[opacity,background-color,border-color,color] hover:border-[var(--series-1)] hover:bg-muted/50 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <PlusIcon className="size-5" />
              <span className="font-medium">Add connection</span>
              {!data.sessions.length && <span className="text-xs">Connect Revolut or another bank to sync automatically</span>}
            </button>
          </li>
        </ul>
      </CardContent>
      <AddConnectionDialog open={adding} onOpenChange={setAdding} />
      <ConnectionSheet session={open} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function ConnectionTile({ session: s, onOpen }: { session: BankSession; onOpen: () => void }) {
  const status = connectionStatus(s, today());
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${s.aspsp}: ${status.label}. Open details`}
      className="group flex size-full items-start gap-3 rounded-xl border bg-card p-3.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <BankLogo name={s.aspsp} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{s.aspsp}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          <StatusDot tone={status.tone} />
          <span className={cn(status.tone === "critical" ? "text-destructive" : "text-foreground")}>{status.label}</span>
        </div>
        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {/* "x min ago" can tick over between server render and hydration. */}
          <div suppressHydrationWarning>{s.lastSyncAt ? `Synced ${timeAgo(s.lastSyncAt)}` : "Not synced yet"}</div>
          {s.validUntil && <div>Access until {fullDate(s.validUntil.slice(0, 10))}</div>}
          {s.accounts.length > 1 && <div>{plural(s.accounts.length, "account")}</div>}
        </div>
      </div>
      <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function AddConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [country, setCountry] = useState<Country>("LT");
  const [picked, setPicked] = useState<string | null>(null);
  const connect = useConnect();
  const banks = useQuery({
    queryKey: ["aspsps", country],
    queryFn: () => api<Aspsp[]>(`/api/bank/aspsps?country=${country}`),
    enabled: open,
    staleTime: 60 * 60 * 1000,
    // Revolut first: it's what this app is built around.
    select: (list) => [...list].sort((a, b) => Number(/revolut/i.test(b.name)) - Number(/revolut/i.test(a.name))),
  });
  // Revolut (or the first bank) is preselected, so the common case is one click.
  const aspsp = banks.data?.find((b) => b.name === picked) ?? banks.data?.[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !connect.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a bank connection</DialogTitle>
          <DialogDescription>Pick your bank. Transactions sync automatically once you approve access.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank-country">Country</Label>
          <Select
            items={COUNTRIES}
            value={country}
            onValueChange={(v) => {
              if (!v) return;
              setCountry(v as Country);
              setPicked(null);
            }}
          >
            <SelectTrigger id="bank-country" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COUNTRIES).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Bank</span>
          <Command className="rounded-lg! border p-0">
            <CommandInput placeholder="Search banks…" aria-label="Search banks" />
            <CommandList className="max-h-56">
              {banks.isLoading ? (
                <div className="flex flex-col gap-1.5 p-2" aria-busy="true">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                </div>
              ) : banks.error ? (
                <p className="p-3 text-sm text-destructive">{banks.error.message}</p>
              ) : (
                <>
                  <CommandEmpty>No bank with that name in {COUNTRIES[country]}.</CommandEmpty>
                  <CommandGroup>
                    {(banks.data ?? []).map((b) => (
                      <CommandItem key={b.name} value={b.name} onSelect={() => setPicked(b.name)} data-checked={b.name === aspsp?.name}>
                        <BankLogo name={b.name} size="md" />
                        <span className="truncate">{b.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
        <p className="text-xs text-muted-foreground">
          Next, {aspsp?.name ?? "your bank"} asks you to approve read-only access to your transactions (through Enable Banking, a licensed
          Open Banking provider). Then you come straight back here. You can disconnect anytime.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={connect.isPending}>
            Cancel
          </Button>
          <Button onClick={() => aspsp && connect.mutate({ name: aspsp.name, country })} disabled={!aspsp || connect.isPending}>
            {connect.isPending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />}
            {aspsp ? `Continue to ${aspsp.name}` : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Details of one connection in a side sheet: status, actions, accounts and the danger zone. */
function ConnectionSheet({ session, onClose }: { session: BankSession | null; onClose: () => void }) {
  // Keep showing the last session while the sheet animates closed (e.g. after disconnecting).
  const [shown, setShown] = useState(session);
  useEffect(() => {
    if (session) setShown(session);
  }, [session]);
  const current = session ?? shown;
  return (
    <Drawer open={Boolean(session)} onOpenChange={(o) => !o && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:30rem]">
        {current && <ConnectionDetail session={current} onDisconnected={onClose} />}
      </DrawerContent>
    </Drawer>
  );
}

function ConnectionDetail({ session: s, onDisconnected }: { session: BankSession; onDisconnected: () => void }) {
  const connect = useConnect();
  const sync = useSyncNow();
  const status = connectionStatus(s, today());
  const health = sessionHealth(s, today());
  const syncing = s.syncing || sync.isPending;
  const canSync = s.status !== "needs_reconnect";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DrawerHeader className="flex-row items-start justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <BankLogo name={s.aspsp} />
          <div className="min-w-0">
            <DrawerTitle className="truncate text-lg">{s.aspsp}</DrawerTitle>
            <DrawerDescription className="flex items-center gap-1.5 text-xs">
              <StatusDot tone={status.tone} />
              <span className={cn(status.tone === "critical" && "text-destructive")}>{status.label}</span>
            </DrawerDescription>
          </div>
        </div>
        <DrawerClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
          <XIcon />
        </DrawerClose>
      </DrawerHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 select-text">
        {health.message && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border p-3 text-sm",
              health.level === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "bg-muted/40 text-[var(--text-secondary)]",
            )}
          >
            <CircleAlertIcon
              className="mt-0.5 size-4 shrink-0"
              style={{ color: TONE_COLOR[health.level === "error" ? "critical" : "warning"] }}
            />
            {health.message}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Last sync</dt>
            <dd
              className="mt-0.5 font-medium"
              suppressHydrationWarning
              title={s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("en-GB") : undefined}
            >
              {syncing ? "In progress…" : s.lastSyncAt ? timeAgo(s.lastSyncAt) : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Access until</dt>
            <dd className="mt-0.5 font-medium">{s.validUntil ? fullDate(s.validUntil.slice(0, 10)) : "—"}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          {canSync && (
            <Button variant="outline" onClick={() => sync.mutate()} disabled={syncing}>
              <RefreshCwIcon className={cn(syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
          {needsReconnect(s, today()) && (
            <Button onClick={() => connect.mutate({ name: s.aspsp, country: s.country })} disabled={connect.isPending}>
              {connect.isPending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />} Reconnect
            </Button>
          )}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Accounts</h3>
          {s.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">The bank didn't share any accounts with this connection.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {s.accounts.map((a) => (
                <AccountRow key={a.key} account={a} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Switching an account off hides its transactions; nothing is deleted.</p>
        </section>

        <section className="mt-auto flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
              Stop syncing and revoke the bank's access. Imported transactions stay.
            </p>
            <DisconnectButton session={s} onDone={onDisconnected} />
          </div>
        </section>
      </div>
    </div>
  );
}

function AccountRow({ account: a }: { account: BankAccount }) {
  const setIncluded = useSetIncluded();
  const label = a.name ?? a.iban ?? "Account";
  const gap = !a.included && historyGap(a.syncedThrough);
  const id = `account-${a.key}`;
  const details = [
    a.name ? a.iban : null,
    a.currency,
    a.syncedThrough ? `Synced through ${shortDate(a.syncedThrough.slice(0, 10))}` : "Not synced yet",
  ];
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={cn("block truncate text-sm font-medium", !a.included && "text-muted-foreground")}>
            {label}
          </label>
          <div className="text-xs text-muted-foreground">{details.filter(Boolean).join(" · ")}</div>
        </div>
        <Switch
          id={id}
          checked={a.included}
          onCheckedChange={(included) => setIncluded.mutate({ key: a.key, included, name: label })}
          aria-label={`Include ${label}`}
        />
      </div>
      {gap && (
        <p className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" style={{ color: "var(--status-warning)" }} />
          Last synced over 90 days ago. Switching it back on may not bring back everything in between — banks often share only the last 90
          days. Import a CSV statement or reconnect to fill the gap.
        </p>
      )}
    </li>
  );
}

/** Flips the Included switch right away; the server confirms (or it flips back with an error). */
function useSetIncluded() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ key, included }: { key: string; included: boolean; name: string }) =>
      api<{ ok: true; syncing: boolean }>("/api/bank/accounts", { method: "PATCH", body: JSON.stringify({ key, included }) }),
    onMutate: async ({ key, included }) => {
      await qc.cancelQueries({ queryKey: keys.status });
      const previous = qc.getQueryData<DataStatusPayload>(keys.status);
      if (previous) {
        qc.setQueryData<DataStatusPayload>(keys.status, {
          ...previous,
          sessions: previous.sessions.map((s) => ({ ...s, accounts: s.accounts.map((a) => (a.key === key ? { ...a, included } : a)) })),
        });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.status, ctx.previous);
      toast.error(e.message);
    },
    onSuccess: (r, { included, name }) => {
      if (!included) toast.success(`${name} switched off`, { description: "Its transactions are hidden. Nothing was deleted." });
      // <SyncWatcher /> replaces this toast once the backfill finishes.
      else if (r.syncing)
        toast.loading(`Syncing ${name}…`, { id: SYNC_TOAST_ID, description: "Fetching what was missed while it was off." });
      else toast.success(`${name} switched on`);
    },
    // Every view (subscriptions, history, transactions) depends on which accounts are visible.
    onSettled: () => invalidate(),
  });
}

function DisconnectButton({ session: s, onDone }: { session: BankSession; onDone: () => void }) {
  const invalidate = useInvalidateAll();
  // Controlled, so the dialog stays open with a spinner until the server confirms.
  const [open, setOpen] = useState(false);
  const excluded = s.accounts.filter((a) => !a.included).length;
  const disconnect = useMutation({
    mutationFn: () => api(`/api/bank/sessions/${encodeURIComponent(s.sessionId)}`, { method: "DELETE" }),
    onSuccess: () => {
      setOpen(false);
      onDone();
      toast.success(`${s.aspsp} disconnected`, { description: "Imported transactions are kept." });
      void invalidate();
    },
    onError: (e) => toast.error(`Couldn't disconnect: ${e.message}`),
  });
  return (
    <AlertDialog open={open} onOpenChange={(o) => !disconnect.isPending && setOpen(o)}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <UnlinkIcon /> Disconnect
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {s.aspsp}?</AlertDialogTitle>
          <AlertDialogDescription>
            Syncing stops and the bank's access is revoked. Your {plural(s.transactionCount, "imported transaction")} stay. You can
            reconnect anytime.
            {excluded > 0 &&
              ` Transactions from the ${excluded === 1 ? "account" : `${excluded} accounts`} you switched off will show again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disconnect.isPending}>Keep connected</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {disconnect.isPending ? <Loader2Icon className="animate-spin" /> : <UnlinkIcon />}
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SetupCard({ hours }: { hours: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4" /> Bank connections (optional)
        </CardTitle>
        <CardDescription>
          Revolut has no public API for personal accounts, so syncing goes through Enable Banking — a licensed Open Banking provider that is
          free for linking your own accounts. New transactions arrive every {Math.max(6, hours || 12)}h.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>
            Sign up at{" "}
            <a className="underline hover:text-foreground" href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer">
              enablebanking.com
            </a>{" "}
            → API applications → add a <b>Production</b> app with redirect URL{" "}
            <code className="text-xs">https://localhost:3000/api/bank/callback</code> (https only — run{" "}
            <code className="text-xs">npm run dev:https</code> locally, or use your hosted https domain).
          </li>
          <li>On the app, click “Activate by linking accounts” and link your Revolut account (free personal use).</li>
          <li>
            Save the private key as <code className="text-xs">data/enablebanking.pem</code>, set{" "}
            <code className="text-xs">ENABLE_BANKING_APP_ID</code> in <code className="text-xs">.env</code> and restart. Then add the
            connection here.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
