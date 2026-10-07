import type { ChartFocusMatch, ChartFocusSource } from "@tanstack/charts";
import { tokens } from "./palette";

const stepsBack = new WeakMap<HTMLElement, number>();

/**
 * `onRender` hook: Tab lands on the chart's latest point (or `back` points before it) instead of its
 * oldest. @tanstack/charts always enters on the first point of its navigation order, so a keyboard
 * entry is followed by End (and `back` Left presses): the keys a reader would press anyway, so the
 * chart's own focus, tooltip and status announcement stay in charge, and arrows stay chronological.
 */
export function enterNearEnd(back = 0) {
  return ({ container }: { container: HTMLElement }) => {
    const wired = stepsBack.has(container);
    stepsBack.set(container, back);
    if (wired) return;
    container.addEventListener("focusin", (e) => {
      const target = e.target;
      // Keyboard entry only; a click focuses the point under the pointer.
      if (!(target instanceof SVGSVGElement) || !target.matches(":focus-visible")) return;
      const press = (key: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      press("End");
      for (let i = 0; i < (stepsBack.get(container) ?? 0); i++) press("ArrowLeft");
    });
  };
}

/**
 * DESIGN.md: the focused mark gets a 2px ink stroke, for keyboard focus only (the pointer has the hover
 * band). A mark state for a full-band, otherwise invisible rect; `source` is "programmatic" for charts
 * that drive focus themselves (SubscriptionTimeline).
 */
export const keyboardRing = (match: ChartFocusMatch, source: ChartFocusSource = "keyboard") =>
  [{ when: { focus: match, source }, style: { stroke: tokens.textPrimary, strokeWidth: 2 } }] as const;
