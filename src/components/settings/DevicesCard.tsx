"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  BellOffIcon,
  CheckIcon,
  CircleAlertIcon,
  Loader2Icon,
  MonitorSmartphoneIcon,
  SendIcon,
  ShareIcon,
  SquarePlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fullDate, localDate } from "@/lib/format";
import { api, keys, pushDevicesQuery, pushKeyQuery, settingsQuery } from "@/lib/query/options";
import { site } from "@/lib/site";
import type { PushDevice } from "@/lib/types";

// Settings → Notifications → Devices: turn on Web Push for this browser/phone and manage the
// devices that get notifications. iOS only delivers push to apps added to the home screen.

type BrowserPush = {
  /** This browser can subscribe (service workers + Push API + Notification API). */
  supported: boolean;
  /** iPhone/iPad (iPadOS reports itself as a Mac, so touch points give it away). */
  ios: boolean;
  /** Running as an installed home-screen app. */
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  /** This browser's current push subscription, if any. */
  endpoint: string | null;
};

function detectBrowser(): Omit<BrowserPush, "endpoint"> {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { supported, ios, standalone, permission: "Notification" in window ? Notification.permission : "unsupported" };
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((x, i) => x === b[i]);
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function DevicesCard() {
  const qc = useQueryClient();
  const devices = useQuery(pushDevicesQuery());
  const configured = devices.data?.configured === true;
  const publicKey = useQuery({ ...pushKeyQuery(), enabled: configured });
  const [browser, setBrowser] = useState<BrowserPush | null>(null);
  const [enabling, setEnabling] = useState(false);

  // Browser capabilities are only known on the client (and differ from the server render).
  useEffect(() => {
    const env = detectBrowser();
    setBrowser({ ...env, endpoint: null });
    if (env.supported) {
      currentSubscription()
        .then((sub) => setBrowser((b) => (b ? { ...b, endpoint: sub?.endpoint ?? null } : b)))
        .catch(() => undefined);
    }
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.pushDevices });
  const thisDeviceOn = Boolean(browser?.endpoint && devices.data?.devices.some((d) => d.endpoint === browser.endpoint));

  // Not a mutation on purpose: the permission prompt must be requested synchronously inside the
  // tap, or Safari refuses to show it.
  const enable = () => {
    if (!browser?.supported || !publicKey.data?.publicKey) return;
    const key = base64UrlToBytes(publicKey.data.publicKey);
    const permission = Notification.requestPermission();
    setEnabling(true);
    (async () => {
      const result = await permission;
      setBrowser((b) => (b ? { ...b, permission: result } : b));
      if (result !== "granted") {
        if (result === "denied")
          toast.error("Notifications are blocked", { description: "Allow them in this site's browser settings, then try again." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      let replaces: string | null = null;
      // A subscription made with older VAPID keys can't be reused; the new one takes over its row.
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        replaces = sub.endpoint;
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api<PushDevice>("/api/push/subscriptions", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON(), replaces }) });
      setBrowser((b) => (b ? { ...b, endpoint: sub.endpoint } : b));
      await refresh();
      toast.success("Notifications are on for this device");
    })()
      .catch((e: unknown) => toast.error("Couldn't turn on notifications", { description: e instanceof Error ? e.message : String(e) }))
      .finally(() => setEnabling(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphoneIcon className="size-4" /> Devices
        </CardTitle>
        <CardDescription>Push notifications appear on your phone or computer even when the app is closed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {devices.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : devices.error ? (
          <p className="text-sm text-destructive">{devices.error.message}</p>
        ) : !configured ? (
          <PushSetup problem={devices.data?.problem ?? null} />
        ) : (
          <>
            <ThisDevice
              browser={browser}
              on={thisDeviceOn}
              enabling={enabling}
              ready={Boolean(publicKey.data?.publicKey)}
              onEnable={enable}
            />
            <DeviceList devices={devices.data?.devices ?? []} currentEndpoint={browser?.endpoint ?? null} onChanged={refresh} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ThisDevice(props: { browser: BrowserPush | null; on: boolean; enabling: boolean; ready: boolean; onEnable: () => void }) {
  const { browser, on, enabling } = props;
  if (!browser) return <Skeleton className="h-14 w-full" />;
  if (browser.ios && !browser.standalone) return <AddToHomeScreen />;
  if (!browser.supported) {
    return <Notice icon={BellOffIcon}>This browser can't receive push notifications. Try Chrome, Edge, Firefox or Safari.</Notice>;
  }
  if (on) {
    return (
      <Notice icon={CheckIcon} tone="good">
        Notifications are on for this device.
      </Notice>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="min-w-0 text-sm">
        <div className="font-medium">This device</div>
        <div className="text-muted-foreground">
          {browser.permission === "denied"
            ? "Notifications are blocked. Allow them in this site's browser settings, then try again."
            : "Your browser will ask for permission."}
        </div>
      </div>
      <Button onClick={props.onEnable} disabled={enabling || !props.ready}>
        {enabling ? <Loader2Icon className="animate-spin" /> : <BellIcon />}
        Enable on this device
      </Button>
    </div>
  );
}

function AddToHomeScreen() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="font-medium">Add to your Home Screen first</div>
      <p className="mt-0.5 text-muted-foreground">On iPhone and iPad, notifications only work in the installed app (iOS 16.4 or later).</p>
      <ol className="mt-2 ml-5 list-decimal space-y-1.5 text-muted-foreground">
        <li>
          In Safari, tap <ShareIcon className="inline size-3.5 align-[-2px]" aria-label="Share" /> <b className="text-foreground">Share</b>{" "}
          in the toolbar.
        </li>
        <li>
          Choose <SquarePlusIcon className="inline size-3.5 align-[-2px]" aria-hidden />{" "}
          <b className="text-foreground">Add to Home Screen</b>, then <b className="text-foreground">Add</b>.
        </li>
        <li>
          Open {site.name} from your Home Screen, come back here and tap <b className="text-foreground">Enable on this device</b>.
        </li>
      </ol>
    </div>
  );
}

function DeviceList({
  devices,
  currentEndpoint,
  onChanged,
}: {
  devices: PushDevice[];
  currentEndpoint: string | null;
  onChanged: () => void;
}) {
  if (!devices.length) {
    return (
      <p className="text-sm text-muted-foreground">No devices yet. Enable notifications on each phone or computer you want them on.</p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {devices.map((d) => (
        <DeviceRow key={d.endpoint} device={d} current={d.endpoint === currentEndpoint} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function DeviceRow({ device, current, onChanged }: { device: PushDevice; current: boolean; onChanged: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The saved zone (prefetched with the page), so the server render and the browser agree on the day.
  const timeZone = useQuery(settingsQuery()).data?.timeZone;
  const test = useMutation({
    mutationFn: () => api<{ sent: number }>("/api/push/test", { method: "POST", body: JSON.stringify({ endpoint: device.endpoint }) }),
    onSuccess: () => toast.success(`Test sent to ${device.name}`),
    onError: (e) => {
      toast.error(e.message);
      onChanged(); // an expired device is removed server-side
    },
  });
  // Controlled so the dialog stays open (with a spinner) until the server confirms.
  const remove = useMutation({
    mutationFn: async () => {
      await api("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: device.endpoint }) });
      if (current) await (await currentSubscription())?.unsubscribe();
    },
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(`${device.name} removed`);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
      <div className="min-w-48 flex-1">
        <div className="flex items-center gap-2 font-medium">
          <span className="truncate">{device.name}</span>
          {current && <Badge variant="secondary">This device</Badge>}
        </div>
        {/* "x min ago" depends on the clock, which can tick between the server render and hydration. */}
        <div className="text-xs text-muted-foreground" suppressHydrationWarning>
          Added {fullDate(localDate(device.createdAt, timeZone))} ·{" "}
          {device.lastSuccessAt ? `last notified ${ago(device.lastSuccessAt)}` : "no notifications yet"}
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send test
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)} aria-label={`Remove ${device.name}`}>
          <Trash2Icon /> Remove
        </Button>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !remove.isPending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {device.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops getting push notifications. You can turn them on again from {current ? "this" : "that"} device at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              {remove.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function PushSetup({ problem }: { problem: string | null }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {problem && (
        <Notice icon={CircleAlertIcon} tone="warn">
          {problem}
        </Notice>
      )}
      <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
        <li>
          Run <code className="text-xs">npm run vapid</code> once to generate a key pair.
        </li>
        <li>
          Set <code className="text-xs">VAPID_PUBLIC_KEY</code>, <code className="text-xs">VAPID_PRIVATE_KEY</code> and{" "}
          <code className="text-xs">VAPID_SUBJECT</code> (e.g. <code className="text-xs">mailto:you@example.com</code>) in{" "}
          <code className="text-xs">.env</code> or your hosting's environment variables.
        </li>
        <li>Restart or redeploy, then enable notifications on each device here. Keep the keys: new ones sign every device out of push.</li>
      </ol>
    </div>
  );
}

function Notice({ icon: Icon, tone, children }: { icon: typeof BellIcon; tone?: "good" | "warn"; children: ReactNode }) {
  const color = tone === "good" ? "var(--status-good)" : tone === "warn" ? "var(--status-warning)" : "var(--text-muted)";
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} />
      <span>{children}</span>
    </div>
  );
}
