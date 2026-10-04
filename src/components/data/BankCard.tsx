"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlertIcon, LandmarkIcon, Link2Icon, Loader2Icon, RefreshCwIcon, UnlinkIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { daysUntil, fullDate } from "@/lib/format";
import { useInvalidateAll } from "@/lib/query/mutations";
import { api } from "@/lib/query/options";
import { useLiveStatus } from "@/lib/query/useLiveStatus";
import { dataParams } from "@/lib/search-params";
import type { BankSession } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const EXPIRY_WARNING_DAYS = 14;

/** Shared by the bank card and the Overview pill. */
export function sessionHealth(s: BankSession, today: string): { level: "ok" | "warn" | "error"; message: string | null } {
  if (s.status === "needs_reconnect") return { level: "error", message: s.lastError ?? "Reconnect to keep syncing." };
  const left = s.validUntil ? daysUntil(s.validUntil.slice(0, 10), today) : null;
  if (left !== null && left <= EXPIRY_WARNING_DAYS) {
    return { level: "warn", message: `Access expires in ${Math.max(0, left)} day${left === 1 ? "" : "s"} — reconnect to keep syncing.` };
  }
  if (s.lastError) return { level: "warn", message: s.lastError };
  return { level: "ok", message: null };
}

function useConnect() {
  return useMutation({
    mutationFn: (bank: { name: string; country: string }) =>
      api<{ url: string }>("/api/bank/connect", { method: "POST", body: JSON.stringify(bank) }),
    onSuccess: ({ url }) => window.location.assign(url), // off to Revolut for consent
    onError: (e) => toast.error(e.message),
  });
}

export function BankCard() {
  const { data } = useLiveStatus();
  const invalidate = useInvalidateAll();
  const [{ bank, reason }, setParams] = useQueryStates(dataParams);
  const [country, setCountry] = useState<Country>("LT");
  const [aspsp, setAspsp] = useState<string | null>(null);
  const connect = useConnect();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (bank === "connected") toast.success("Revolut connected", { description: "Importing your transaction history…" });
    if (bank === "error") toast.error("Couldn't connect the bank", { description: reason ?? undefined });
    if (bank) void setParams({ bank: null, reason: null });
  }, [bank, reason, setParams]);

  const banks = useQuery({
    queryKey: ["aspsps", country],
    queryFn: () => api<{ name: string; country: string }[]>(`/api/bank/aspsps?country=${country}`),
    enabled: data.bankConfigured,
    staleTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    if (banks.data) setAspsp(banks.data.find((b) => /revolut/i.test(b.name))?.name ?? banks.data[0]?.name ?? null);
  }, [banks.data]);

  const sync = useMutation({
    mutationFn: () => api<SyncResult>("/api/bank/sync", { method: "POST" }),
    onSuccess: (s) => {
      if (s.errors.length) toast.warning("Sync finished with problems", { description: s.errors.join("\n") });
      else toast.success(s.inserted ? `${s.inserted} new transactions` : "Already up to date");
      void invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/api/bank/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Disconnected. Imported transactions are kept.");
      void invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!data.bankConfigured) return <SetupCard hours={data.syncIntervalHours} />;

  const items = Object.fromEntries((banks.data ?? []).map((b) => [b.name, b.name]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4" /> Automatic sync
        </CardTitle>
        <CardDescription>
          New transactions are pulled every {Math.max(6, data.syncIntervalHours)}h. Revolut access lasts up to 180 days, then you reconnect in one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.syncing && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Loader2Icon className="size-4 animate-spin" /> Importing transactions from your bank…
          </div>
        )}
        {data.sessions.map((s) => {
          const health = sessionHealth(s, today);
          return (
            <div key={s.sessionId} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 font-medium">
                  {s.aspsp}{" "}
                  <span className="text-muted-foreground">· {s.accounts.map((a) => [a.name, a.iban].filter(Boolean).join(" ")).join(", ")}</span>
                </div>
                <div className="flex gap-1.5">
                  {health.level !== "ok" && s.status === "needs_reconnect" ? null : (
                    <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending || data.syncing}>
                      <RefreshCwIcon className={cn((sync.isPending || data.syncing) && "animate-spin")} /> Sync now
                    </Button>
                  )}
                  {health.level !== "ok" && (
                    <Button size="sm" onClick={() => connect.mutate({ name: s.aspsp, country: s.country })} disabled={connect.isPending}>
                      <Link2Icon /> Reconnect
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => disconnect.mutate(s.sessionId)} aria-label={`Disconnect ${s.aspsp}`}>
                    <UnlinkIcon />
                  </Button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last sync {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("en-GB") : data.syncing ? "in progress" : "never"}
                {s.validUntil && ` · access until ${fullDate(s.validUntil.slice(0, 10))}`}
              </div>
              {health.message && (
                <div
                  className={cn(
                    "mt-2 flex items-start gap-1.5 text-xs",
                    health.level === "error" ? "text-destructive" : "text-[var(--text-secondary)]",
                  )}
                >
                  <CircleAlertIcon
                    className="mt-px size-3.5 shrink-0"
                    style={{ color: health.level === "error" ? "var(--status-critical)" : "var(--status-warning)" }}
                  />
                  {health.message}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <Select items={COUNTRIES} value={country} onValueChange={(v) => v && setCountry(v as Country)}>
            <SelectTrigger className="w-40" aria-label="Country">
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
          <Select items={items} value={aspsp} onValueChange={(v) => setAspsp(v)}>
            <SelectTrigger className="min-w-48 flex-1" aria-label="Bank">
              <SelectValue placeholder={banks.isLoading ? "Loading banks…" : "Choose a bank"} />
            </SelectTrigger>
            <SelectContent>
              {(banks.data ?? []).map((b) => (
                <SelectItem key={b.name} value={b.name}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => aspsp && connect.mutate({ name: aspsp, country })} disabled={!aspsp || connect.isPending}>
            {connect.isPending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />}
            {data.sessions.length ? "Connect another" : "Connect"}
          </Button>
        </div>
        {banks.error && <p className="text-sm text-destructive">{banks.error.message}</p>}
      </CardContent>
    </Card>
  );
}

function SetupCard({ hours }: { hours: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LandmarkIcon className="size-4" /> Automatic Revolut sync (optional)
        </CardTitle>
        <CardDescription>
          Revolut has no public API for personal accounts, so syncing goes through Enable Banking — a licensed Open Banking provider that is free
          for linking your own accounts. New transactions arrive every {Math.max(6, hours || 12)}h.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>
            Sign up at{" "}
            <a className="underline" href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer">
              enablebanking.com
            </a>{" "}
            → API applications → add a <b>Production</b> app with redirect URL <code className="text-xs">https://localhost:3000/api/bank/callback</code> (https only — run{" "}
            <code className="text-xs">npm run dev:https</code> locally, or use your hosted https domain).
          </li>
          <li>On the app, click “Activate by linking accounts” and link your Revolut account (free personal use).</li>
          <li>
            Save the private key as <code className="text-xs">data/enablebanking.pem</code>, set <code className="text-xs">ENABLE_BANKING_APP_ID</code> in{" "}
            <code className="text-xs">.env</code> and restart. Then connect Revolut here.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
