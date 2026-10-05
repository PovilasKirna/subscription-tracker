"use client";

import { startTransition, useEffect, useState } from "react";
import { effectivePageSize, type PageSize } from "@/lib/search-params";

/** Below Tailwind's `md`: the same cut-off the shell uses for the phone layout. */
const PHONE_QUERY = "(max-width: 767px)";

/**
 * Rows per page for a URL-backed table. `explicit` is the URL's `?perPage` (null when absent) and
 * always wins; otherwise phones get a shorter page. The server can't see the viewport, so the first
 * render (server and hydration) uses the desktop default and a phone switches right after mount,
 * inside a transition so the rows already on screen stay put (dimmed) until the shorter page loads.
 * The query's `change` event is followed, so crossing `md` (resize, rotation) keeps the default
 * matching the active layout.
 */
export function usePageSize(explicit: PageSize | null) {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const sync = () => startTransition(() => setPhone(mql.matches));
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  const fallback = effectivePageSize(null, phone);
  return {
    /** The page size to query and render with. */
    perPage: effectivePageSize(explicit, phone),
    /** What to write to the URL for a chosen size: nothing when it is just the device default. */
    toParam: (size: PageSize) => (size === fallback ? null : size),
  };
}
