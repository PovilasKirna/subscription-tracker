"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LAYOUT, type Layout, parseLayout, sameLayout, serializeLayout } from "./widgets";

// Two small stores behind useSyncExternalStore (the same pattern as renewal-view.ts):
// - the Overview layout, kept in localStorage, so each device has its own;
// - whether the Overview is in edit mode, shared by the header's Edit button and the widget grid
//   (they sit in different parts of the tree, and the header is rendered by the server page).

const KEY = "hoard:overview-layout:v1";

const layoutListeners = new Set<() => void>();
// In memory too, so edits still apply for this visit when storage is blocked.
let current: Layout | null = null;

function load(): Layout {
  try {
    return parseLayout(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LAYOUT; // storage blocked (private mode, disabled site data)
  }
}

function getLayout(): Layout {
  current ??= load();
  return current;
}

const getServerLayout = () => DEFAULT_LAYOUT;

function subscribeLayout(onChange: () => void) {
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    current = load();
    onChange();
  };
  layoutListeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    layoutListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLayout(next: Layout) {
  if (current && sameLayout(current, next)) return;
  current = next;
  try {
    // The default is stored as "nothing", so a later change to the default reaches this device too.
    if (sameLayout(next, DEFAULT_LAYOUT)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, serializeLayout(next));
  } catch {
    // Not persisted; still applies for this visit.
  }
  for (const l of layoutListeners) l();
}

/**
 * The Overview layout for this device. The server and the hydrating client both render the default;
 * a stored layout takes over right after hydration, so the markup never mismatches.
 */
export function useOverviewLayout(): Layout {
  return useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
}

const editListeners = new Set<() => void>();
let editing = false;

export function setEditing(next: boolean) {
  if (editing === next) return;
  editing = next;
  for (const l of editListeners) l();
}

function subscribeEditing(onChange: () => void) {
  editListeners.add(onChange);
  return () => {
    editListeners.delete(onChange);
  };
}

/** Whether the Overview is being rearranged. Always off on the server and when the page loads. */
export function useEditingOverview(): boolean {
  return useSyncExternalStore(
    subscribeEditing,
    () => editing,
    () => false,
  );
}
