// Calendar maths in the user's time zone (Settings → General), shared by the notification planner
// and the settings UI. Plain Intl, no date library: dates are YYYY-MM-DD strings, as everywhere else.

export const DEFAULT_TIME_ZONE = "Europe/Vilnius";

/** Where a moment falls on the wall clock of `timeZone`. */
export type ZonedParts = {
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month: string;
  /** Day of the month, 1–31. */
  day: number;
  /** 0–23 */
  hour: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(now: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const month = `${get("year")}-${get("month")}`;
  return {
    date: `${month}-${get("day")}`,
    month,
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    weekday: WEEKDAYS[get("weekday")] ?? 1,
  };
}

/** Whether the runtime knows this IANA zone (e.g. "Europe/Vilnius"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Every IANA zone the runtime supports (for the picker), with UTC first. */
export function allTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [DEFAULT_TIME_ZONE];
  return ["UTC", ...zones.filter((z) => z !== "UTC")];
}

/** "+03:00": the zone's current offset from UTC, for labels. */
export function utcOffsetLabel(timeZone: string, now = new Date()): string {
  try {
    const name =
      new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")
        ?.value ?? "GMT";
    return name === "GMT" ? "+00:00" : name.replace("GMT", "");
  } catch {
    return "";
  }
}

const DAY = 86_400_000;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** "09:00" */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
