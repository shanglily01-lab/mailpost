import { processQueue } from "./actions";
import { loadState, mutateState } from "./store";
import type { AppState } from "./types";

const INTERVAL_MS = 25_000;

declare global {
  var __mailpostTickTimer: ReturnType<typeof setTimeout> | undefined;
  var __mailpostPumping: boolean | undefined;
}

function runningQueue(state: AppState): boolean {
  const running = (state.campaigns || []).some((campaign) => campaign.status === "running");
  const queued = (state.jobs || []).some((job) => job.status === "queued" && Date.parse(job.scheduledAt) <= Date.now());
  return running && queued;
}

function nextSendDue(state: AppState): boolean {
  if (!runningQueue(state)) return false;
  let last = 0;
  for (const job of state.jobs || []) {
    if (!job.sentAt) continue;
    const at = Date.parse(job.sentAt);
    if (at > last) last = at;
  }
  return Date.now() - last >= INTERVAL_MS;
}

function scheduleNext() {
  if (globalThis.__mailpostTickTimer) return;
  globalThis.__mailpostTickTimer = setTimeout(() => {
    globalThis.__mailpostTickTimer = undefined;
    void ensureTicker();
  }, INTERVAL_MS);
}

export async function ensureTicker(): Promise<void> {
  const state = loadState();
  if (!runningQueue(state)) return;
  scheduleNext();
  if (globalThis.__mailpostPumping || !nextSendDue(state)) return;
  globalThis.__mailpostPumping = true;
  try {
    await mutateState((current) => (nextSendDue(current) ? processQueue(current, 1) : undefined));
  } catch {
    // The next refresh tries again.
  } finally {
    globalThis.__mailpostPumping = false;
    if (runningQueue(loadState())) scheduleNext();
  }
}
