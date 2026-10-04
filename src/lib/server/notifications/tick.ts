import type { SchedulerStatusPayload, TickSource } from "../../types";
import { bankConfigured, config } from "../config";
import { getDb } from "../db";
import { getState, setState } from "../settings";
import { minSyncIntervalHours, syncAll } from "../sync";
import { runNotifications } from "./run";
import { recordTick, schedulerHealth } from "./scheduler";

// One "tick" of the scheduler: sync banks that are due, then notifications. Called hourly by
// /api/cron/tick (cron-job.org, Vercel Cron) or the self-hosted timer in instrumentation.ts.

type LastTick = NonNullable<SchedulerStatusPayload["lastResult"]>;

/** Notes that a tick happened (before the work, so even a failing run shows the scheduler is alive). */
async function noteTick(at: string) {
  const db = await getDb();
  await setState(db, "state.ticks", recordTick((await getState<string[]>(db, "state.ticks")) ?? [], at));
}

export async function tick(source: TickSource, opts: { sync?: boolean } = {}): Promise<LastTick> {
  const at = new Date().toISOString();
  await noteTick(at);
  let error: string | null = null;
  try {
    if (opts.sync !== false && bankConfigured()) {
      const s = await syncAll({ background: true, minIntervalHours: minSyncIntervalHours() });
      if (s.inserted || s.errors.length) console.log(`[sync] +${s.inserted} new, ${s.updated} updated, ${s.skipped} duplicates`, s.errors);
    }
    await runNotifications();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[tick] failed:`, e);
  }
  const result: LastTick = { at, ok: !error, error, source };
  await setState(await getDb(), "state.lastTick", result);
  return result;
}

export async function getSchedulerStatus(now = new Date()): Promise<SchedulerStatusPayload> {
  const db = await getDb();
  const [ticks, lastResult] = await Promise.all([getState<string[]>(db, "state.ticks"), getState<LastTick>(db, "state.lastTick")]);
  const health = schedulerHealth(ticks ?? [], now);
  return {
    health: health.state,
    lastTickAt: health.lastTickAt,
    typicalGapMinutes: health.typicalGapMinutes,
    lastResult,
    cronSecretSet: Boolean(config.cronSecret),
    builtInTimer: !config.serverless,
  };
}
