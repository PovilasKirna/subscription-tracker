"use client";

import { type FocusEvent, type KeyboardEvent, useCallback, useRef, useState } from "react";

/** Which arrow keys step backwards / forwards through a layout's marks. */
export type NavKeys = { prev: readonly string[]; next: readonly string[] };
export const ANY_ARROW: NavKeys = { prev: ["ArrowLeft", "ArrowUp"], next: ["ArrowRight", "ArrowDown"] };

/**
 * Roving focus for app-owned SVG layouts (RenewalCalendar; chart definitions get theirs from
 * @tanstack/charts): the layout is one tab stop, the arrow keys (plus Home / End) move DOM focus
 * between its marks, so a screen reader reads each mark's name as it lands. `initial` is the mark Tab
 * enters on until the user picks another. `focused` / `ringVisible` drive the drawn focus ring, which
 * only shows for keyboard focus (`:focus-visible`), never for a mouse click.
 */
export function useRovingFocus(count: number, initial = 0) {
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [ringVisible, setRingVisible] = useState(false);
  const els = useRef<(SVGElement | null)[]>([]);
  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1);
  const current = count > 0 ? clamp(active ?? initial) : -1;

  const ref = useCallback(
    (i: number) => (el: SVGElement | null) => {
      els.current[i] = el;
    },
    [],
  );
  const focusIndex = (i: number) => {
    if (count > 0) els.current[clamp(i)]?.focus();
  };
  const onFocus = (i: number, e: FocusEvent<SVGElement>) => {
    setActive(i);
    setFocused(i);
    let visible = true;
    try {
      visible = e.currentTarget.matches(":focus-visible");
    } catch {}
    setRingVisible(visible);
  };
  /** True when focus left the layout entirely (not just moved to a sibling mark). */
  const onBlur = (e: FocusEvent<SVGElement>) => {
    const next = e.relatedTarget as SVGElement | null;
    if (next && els.current.includes(next)) return false;
    setFocused(null);
    return true;
  };
  /** Arrow / Home / End handling; returns true when the key moved focus. */
  const onKeyDown = (i: number, e: KeyboardEvent<SVGElement>, keys: NavKeys = ANY_ARROW) => {
    const next = keys.prev.includes(e.key)
      ? i - 1
      : keys.next.includes(e.key)
        ? i + 1
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? count - 1
            : null;
    if (next === null) return false;
    e.preventDefault();
    focusIndex(next);
    return true;
  };
  return {
    ref,
    tabIndex: (i: number) => (i === current ? 0 : -1),
    focusIndex,
    onFocus,
    onBlur,
    onKeyDown,
    focused,
    ringVisible: focused !== null && ringVisible,
  };
}
