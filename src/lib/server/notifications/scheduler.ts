import type { SchedulerHealth } from "../../types";

// Is something calling /api/cron/tick (or the built-in timer ticking) often enough? Reminders and
// digests go out at the delivery hour only if a tick lands in it, so hourly is what we want.

/** How many recent tick times are kept to judge the rhythm. */
export const TICKS_KEPT = 8;

/** Adds a tick to the recent list (newest last), keeping the last few. */
export function recordTick(ticks: readonly string[], at: string): string[] {
  return [...ticks, at].slice(-TICKS_KEPT);
}

const MIN = 60_000;

/**
 * - `never`: no tick recorded yet.
 * - `stale`: the last one is over 3 hours old (the cron job stopped, or none is set up).
 * - `waiting`: just one recent tick so far; can't tell the rhythm yet.
 * - `hourly`: the typical gap between recent ticks is about an hour or less.
 * - `infrequent`: ticks come, but further apart (e.g. only Vercel's daily cron).
 */
export function schedulerHealth(
  ticks: readonly string[],
  now: Date,
): { state: SchedulerHealth; lastTickAt: string | null; typicalGapMinutes: number | null } {
  const times = ticks
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const last = times.at(-1);
  if (last === undefined) return { state: "never", lastTickAt: null, typicalGapMinutes: null };
  const lastTickAt = new Date(last).toISOString();
  const gaps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((g) => g > 5 * MIN); // two triggers firing together (e.g. Vercel's cron and cron-job.org) aren't a rhythm
  const sorted = [...gaps].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const typicalGapMinutes = typical === null ? null : Math.round(typical / MIN);
  if (now.getTime() - last > 3 * 60 * MIN) return { state: "stale", lastTickAt, typicalGapMinutes };
  if (typical === null) return { state: "waiting", lastTickAt, typicalGapMinutes };
  return { state: typical <= 75 * MIN ? "hourly" : "infrequent", lastTickAt, typicalGapMinutes };
}
