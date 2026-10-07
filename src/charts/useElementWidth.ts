"use client";

import { useCallback, useState } from "react";

/**
 * The content width of an element, kept current with a ResizeObserver. `initial` is used for the
 * server render and the first client render, before anything is measured.
 */
export function useElementWidth<E extends HTMLElement>(initial: number) {
  const [width, setWidth] = useState(initial);
  const ref = useCallback((el: E | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
