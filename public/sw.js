// Service worker: shows Web Push notifications, opens the app when one is clicked, and re-registers
// a subscription the browser rotates.
// No offline caching on purpose: the app always talks to the live server.
// Payload (src/lib/server/push/send.ts): { title, body, url, tag }.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Subscriptions";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only same-origin paths: a push payload can't send the user somewhere else.
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser replaced this device's subscription (Firefox does this; Chrome when keys rotate).
// Subscribe again if it didn't already, and tell the server so the device keeps getting pushes
// instead of quietly dropping off the list when the old endpoint starts returning 410.
// Same-origin fetch, so the session cookie goes along.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let sub = event.newSubscription || (await self.registration.pushManager.getSubscription());
      if (!sub) {
        let key = old?.options?.applicationServerKey;
        if (!key) {
          const res = await fetch("/api/push/key", { credentials: "same-origin" });
          key = res.ok ? (await res.json()).publicKey : null;
        }
        if (!key) return; // push isn't set up on the server any more
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await fetch("/api/push/subscriptions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), replaces: old?.endpoint ?? null }),
      });
    })(),
  );
});
