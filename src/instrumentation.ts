// Runs once when the Next.js server starts: the self-hosted scheduler. Every hour it "ticks":
// syncs bank sessions that are due (so restarts never burn the bank's limited background quota,
// typically 4 fetches per account per day), then plans and delivers notifications. Notifications
// run even without a bank connection (CSV-only installs still get reminders).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // serverless: /api/cron/tick is called by cron-job.org / Vercel Cron instead

  const { tick } = await import("./lib/server/notifications/tick");
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 12);
  const run = () => tick("timer", { sync: hours > 0 }).catch((e) => console.error("[tick] failed:", e));
  setTimeout(run, 60_000);
  setInterval(run, 3_600_000).unref();
}
