import type { ReimbursementMode } from "../types";

// Validation for the reimbursement API bodies. Pure, so the rules are unit tested and the route
// handlers stay thin.

export const MODES: readonly ReimbursementMode[] = ["request", "automatic"];
/** Reminder days stop at 28 so every month has one. */
export const MAX_REMINDER_DAY = 28;
export const DEFAULT_SOURCE = { name: "Salary", mode: "request", reminderDay: 20 } as const satisfies SourceInput;
const MAX_NAME = 60;
const MAX_AMOUNT = 1e7;
/** How far ahead a period may start (e.g. "stop from next month"). */
const MAX_AHEAD_DAYS = 366;

export type SourceInput = { name: string; mode: ReimbursementMode; reminderDay: number | null };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false, error }) as const;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseSourceInput(body: unknown): Result<SourceInput> {
  if (!isObject(body)) return fail("Invalid request");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("Give the source a name");
  if (name.length > MAX_NAME) return fail(`Keep the name under ${MAX_NAME} characters`);
  const mode = body.mode;
  if (!MODES.includes(mode as ReimbursementMode)) return fail("Choose how this source pays back");
  if (mode === "automatic") return { ok: true, value: { name, mode, reminderDay: null } };
  const day = body.reminderDay ?? DEFAULT_SOURCE.reminderDay;
  if (!(Number.isInteger(day) && (day as number) >= 1 && (day as number) <= MAX_REMINDER_DAY)) {
    return fail(`The reminder day must be between 1 and ${MAX_REMINDER_DAY}`);
  }
  return { ok: true, value: { name, mode: "request", reminderDay: day as number } };
}

/** Whole major-unit amount → minor units, or null if it isn't a sensible positive amount. */
export function toMinor(amount: unknown, { allowZero = false } = {}): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount >= MAX_AMOUNT) return null;
  const minor = Math.round(amount * 100);
  return minor > 0 || (allowZero && minor === 0) ? minor : null;
}

/** A real calendar day as YYYY-MM-DD. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

export type PeriodInput = {
  subKey: string;
  startsOn: string;
  /** Who pays: an existing source, a new one, the default "Salary" (created if missing), or nobody (a stop). */
  source: { kind: "existing"; id: number } | { kind: "new"; input: SourceInput } | { kind: "default" } | { kind: "stop" };
  /** Expected back per charge, minor units; 0 for a stop. */
  amountMinor: number;
};

/** `{ subKey, startsOn, stop: true }` or `{ subKey, startsOn, amount, sourceId? | newSource? }`. */
export function parsePeriodInput(body: unknown, today: string): Result<PeriodInput> {
  if (!isObject(body)) return fail("Invalid request");
  const { subKey, startsOn } = body;
  if (typeof subKey !== "string" || !subKey) return fail("Missing subscription");
  if (!isIsoDate(startsOn)) return fail("Pick a valid start date");
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (startsOn > latest) return fail("The start date is too far ahead");
  if (body.stop === true) return { ok: true, value: { subKey, startsOn, source: { kind: "stop" }, amountMinor: 0 } };

  const amountMinor = toMinor(body.amount);
  if (amountMinor === null) return fail("Enter the amount you get back per charge");
  let source: PeriodInput["source"] = { kind: "default" };
  if (body.sourceId != null) {
    if (!(Number.isInteger(body.sourceId) && (body.sourceId as number) > 0)) return fail("Invalid source");
    source = { kind: "existing", id: body.sourceId as number };
  } else if (body.newSource != null) {
    const parsed = parseSourceInput(body.newSource);
    if (!parsed.ok) return parsed;
    source = { kind: "new", input: parsed.value };
  }
  return { ok: true, value: { subKey, startsOn, source, amountMinor } };
}
