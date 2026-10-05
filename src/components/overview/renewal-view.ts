"use client";

import { useSyncExternalStore } from "react";

/** How phones show the renewals month: an agenda list (default) or the calendar grid. */
export type RenewalView = "list" | "calendar";

const KEY = "hoard:renewals-view";
const DEFAULT: RenewalView = "list";
const listeners = new Set<() => void>();
// In memory too, so the toggle still works for this visit when storage is blocked.
let current: RenewalView | null = null;

function load(): RenewalView {
  try {
    return localStorage.getItem(KEY) === "calendar" ? "calendar" : DEFAULT;
  } catch {
    return DEFAULT; // storage blocked (private mode, disabled site data)
  }
}

function getSnapshot(): RenewalView {
  current ??= load();
  return current;
}

function subscribe(onChange: () => void) {
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    current = load();
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setRenewalView(v: RenewalView) {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // Not persisted; still switches for this visit.
  }
  for (const l of listeners) l();
}

/**
 * The phone renewals view, remembered per device. The server and the hydrating client both render
 * the default; a stored choice takes over right after hydration, so the markup never mismatches.
 */
export function useRenewalView(): [RenewalView, (v: RenewalView) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT), setRenewalView];
}
