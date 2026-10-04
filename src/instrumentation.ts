// Runs once when the Next.js server starts: schedules automatic bank syncs.
// Checks hourly and only syncs sessions that are due, so restarts never burn the bank's
// limited background quota (typically 4 fetches per account per day).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // serverless: Vercel Cron calls /api/cron/sync instead
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 12);
  if (!process.env.ENABLE_BANKING_APP_ID || !(hours > 0)) return;

  const { syncAll } = await import("./lib/server/sync");
  const run = () =>
    syncAll({ background: true, minIntervalHours: Math.max(6, hours) })
      .then((s) => {
        if (s.inserted || s.errors.length)
          console.log(`[sync] +${s.inserted} new, ${s.updated} updated, ${s.skipped} duplicates`, s.errors);
      })
      .catch((e) => console.error("[sync] failed:", e));
  setTimeout(run, 60_000);
  setInterval(run, 3_600_000).unref();
}
