"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CircleAlertIcon, CopyIcon, MailIcon, SmartphoneIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { timeAgo } from "@/lib/bank";
import { useSaveSettings } from "@/lib/query/mutations";
import { schedulerQuery, settingsQuery } from "@/lib/query/options";
import {
  type DigestFrequency,
  type EmailDelivery,
  NOTIFICATION_TYPE_INFO,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/settings";
import { hourLabel } from "@/lib/timeZone";
import type { SchedulerHealth, Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

// Settings → Notifications: what to be told about and how (push on/off, email off/immediate/
// digest), the digest frequency, and whether the hourly scheduler that sends it all is running.

const EMAIL_OPTIONS: { value: EmailDelivery; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "immediate", label: "Right away" },
  { value: "digest", label: "Summary" },
];

const DIGEST_OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "off", label: "Off" },
];

export function PreferencesCard() {
  const settings = useQuery(settingsQuery());
  const save = useSaveSettings();
  const s = settings.data;
  const set = (type: NotificationType, pref: Partial<Settings["notifications"][NotificationType]>) =>
    s && save.mutate({ notifications: { [type]: { ...s.notifications[type], ...pref } } });

  return (
    <Card>
      <CardHeader>
        <CardTitle>What to notify about</CardTitle>
        <CardDescription>
          Everything always appears under the bell. Choose what also goes to your devices and inbox; "Summary" collects it into the{" "}
          {s?.digestFrequency === "monthly" ? "monthly" : "weekly"} email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.error ? (
          <p className="text-sm text-destructive">{settings.error.message}</p>
        ) : !s ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="text-sm">
            <div className="hidden gap-4 border-b pb-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_4rem_auto]">
              <span>Type</span>
              <span className="text-center">Push</span>
              <span className="w-[15.5rem]">Email</span>
            </div>
            {NOTIFICATION_TYPES.map((type) => (
              <PreferenceRow key={type} type={type} pref={s.notifications[type]} onChange={(p) => set(type, p)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreferenceRow({
  type,
  pref,
  onChange,
}: {
  type: NotificationType;
  pref: Settings["notifications"][NotificationType];
  onChange: (pref: Partial<Settings["notifications"][NotificationType]>) => void;
}) {
  const id = useId();
  const info = NOTIFICATION_TYPE_INFO[type];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_4rem_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div id={`${id}-label`} className="font-medium">
          {info.label}
        </div>
        <div className="text-xs text-muted-foreground">{info.description}</div>
      </div>
      <div className="flex items-center gap-2 sm:justify-center">
        <Switch checked={pref.push} onCheckedChange={(push) => onChange({ push })} aria-label={`Push: ${info.label}`} />
        <span className="text-xs text-muted-foreground sm:hidden">Push</span>
      </div>
      <div className="justify-self-end sm:justify-self-auto">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[pref.email]}
          onValueChange={(v: string[]) => v[0] && onChange({ email: v[0] as EmailDelivery })}
          aria-label={`Email: ${info.label}`}
        >
          {EMAIL_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className="px-2.5 data-pressed:bg-muted data-pressed:font-semibold">
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

export function DigestCard() {
  const settings = useQuery(settingsQuery());
  const save = useSaveSettings();
  const s = settings.data;
  const when =
    s?.digestFrequency === "weekly"
      ? `every Monday from ${hourLabel(s.deliveryHour)}`
      : s?.digestFrequency === "monthly"
        ? `on the 1st of each month from ${hourLabel(s.deliveryHour)}`
        : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary email</CardTitle>
        <CardDescription>
          Your net monthly cost, renewals coming up, reimbursements still outstanding, and everything set to "Summary" above. Sent even in
          quiet weeks, so you know it's working.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {s ? (
          <>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[s.digestFrequency]}
              onValueChange={(v: string[]) => v[0] && save.mutate({ digestFrequency: v[0] as DigestFrequency })}
              aria-label="Summary email frequency"
            >
              {DIGEST_OPTIONS.map((o) => (
                <ToggleGroupItem key={o.value} value={o.value} className="px-3 data-pressed:bg-muted data-pressed:font-semibold">
                  {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {when ? (
                <>
                  Arrives {when} ({s.timeZone.replaceAll("_", " ")} time).{" "}
                  <Link href="/settings/general" className="underline underline-offset-2 hover:text-foreground">
                    Change
                  </Link>
                </>
              ) : (
                'No summary email. Types set to "Summary" only appear under the bell.'
              )}
            </p>
          </>
        ) : (
          <Skeleton className="h-14 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

/** Push and email arrive with the delivery channels; until then this says so. */
export function ChannelsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices & email</CardTitle>
        <CardDescription>Where push notifications and emails are delivered.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y text-sm">
        {[
          { icon: SmartphoneIcon, label: "Push notifications", note: "Phones and browsers that show notifications." },
          { icon: MailIcon, label: "Email", note: "Immediate emails and the summary." },
        ].map(({ icon: Icon, label, note }) => (
          <div key={label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{note}</div>
            </div>
            <Badge variant="outline" className="text-muted-foreground">
              Not set up yet
            </Badge>
          </div>
        ))}
        <p className="pt-2.5 text-xs text-muted-foreground">Until then, notifications collect under the bell.</p>
      </CardContent>
    </Card>
  );
}

const HEALTH: Record<SchedulerHealth, { label: string; tone: "good" | "warning" | "critical" | "muted"; note: string }> = {
  hourly: { label: "Running hourly", tone: "good", note: "Reminders and summaries go out on time." },
  waiting: { label: "Started", tone: "good", note: "One run so far; the rhythm shows after the next one." },
  infrequent: {
    label: "Not hourly",
    tone: "warning",
    note: "Runs come further apart than an hour, so reminders can arrive hours after the delivery hour. Set up an hourly job.",
  },
  stale: { label: "Stopped", tone: "critical", note: "Nothing has run for over 3 hours. Check your cron job." },
  never: { label: "Not running", tone: "critical", note: "Nothing has called the scheduler yet. Set up an hourly job below." },
};

const TONE_COLOR = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  muted: "var(--muted-foreground)",
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-2.5">
        <code className="min-w-0 flex-1 truncate text-xs" title={value}>
          {value}
        </code>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}

export function SchedulerCard() {
  const status = useQuery({ ...schedulerQuery(), refetchInterval: 60_000 });
  // The tick URL uses the address this page is open at (correct behind proxies and custom domains).
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const s = status.data;
  const health = s ? HEALTH[s.health] : null;
  const healthy = s?.health === "hourly" || s?.health === "waiting";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TimerIcon className="size-4" /> Scheduler
        </CardTitle>
        <CardDescription>
          Once an hour something has to wake the app up: it syncs banks that are due and sends what's ready. Reminders only go out when that
          happens.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {status.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : status.error ? (
          <p className="text-destructive">{status.error.message}</p>
        ) : (
          s &&
          health && (
            <>
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[health.tone] }} aria-hidden />
                <div className="min-w-0">
                  <div className="font-medium">{health.label}</div>
                  <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {s.lastTickAt ? `Last run ${timeAgo(s.lastTickAt)}` : "No runs yet"}
                    {s.lastResult && ` (${s.lastResult.source === "timer" ? "built-in timer" : "tick URL"})`}
                    {s.typicalGapMinutes !== null && ` · usually every ${formatGap(s.typicalGapMinutes)}`}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {s.builtInTimer && !healthy ? "The built-in hourly timer runs while the server is up." : health.note}
                  </div>
                  {s.lastResult && !s.lastResult.ok && (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" /> Last run failed: {s.lastResult.error}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CopyField label="Tick URL" value={`${origin}/api/cron/tick`} />
                <CopyField label="Header" value="Authorization: Bearer <CRON_SECRET>" />
              </div>
              <p className={cn("flex items-center gap-1.5 text-xs", s.cronSecretSet ? "text-muted-foreground" : "text-destructive")}>
                {s.cronSecretSet ? <CheckIcon className="size-3.5" /> : <CircleAlertIcon className="size-3.5" />}
                {s.cronSecretSet
                  ? "CRON_SECRET is set on the server. Use its value in the header (it's never shown here)."
                  : "CRON_SECRET isn't set, so the tick URL refuses every call. Set it first (step 1)."}
              </p>

              <details open={!healthy && !s.builtInTimer} className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium outline-none select-none focus-visible:underline">
                  Set up an hourly job on cron-job.org
                </summary>
                <ol className="mt-2 ml-5 list-decimal space-y-1.5 text-muted-foreground">
                  <li>
                    Pick a long random secret (e.g. <code className="text-xs">openssl rand -hex 32</code>), set it as{" "}
                    <code className="text-xs">CRON_SECRET</code> in your hosting's environment variables (on Vercel: Project → Settings →
                    Environment Variables) and redeploy.
                  </li>
                  <li>
                    At{" "}
                    <a
                      className="underline hover:text-foreground"
                      href="https://console.cron-job.org/jobs/create"
                      target="_blank"
                      rel="noreferrer"
                    >
                      cron-job.org
                    </a>{" "}
                    (free), create a cron job with the <b className="text-foreground">Tick URL</b> above, scheduled{" "}
                    <b className="text-foreground">every hour</b>.
                  </li>
                  <li>
                    Under <b className="text-foreground">Advanced → Headers</b>, add <code className="text-xs">Authorization</code> with the
                    value <code className="text-xs">Bearer </code> followed by your secret.
                  </li>
                  <li>Save, then use "Test run": the last run above should change to "just now".</li>
                </ol>
                <p className="mt-2 text-muted-foreground">
                  {s.builtInTimer
                    ? "This server also runs a built-in hourly timer, so an external job is optional here."
                    : "Vercel's own cron only runs once a day on the free plan; it stays as a fallback."}
                </p>
              </details>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}

function formatGap(minutes: number): string {
  if (minutes < 90) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  return h < 36 ? `${h} hours` : `${Math.round(h / 24)} days`;
}
