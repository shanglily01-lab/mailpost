import { processQueue } from "./actions";
import { loadState, mutateState } from "./store";

const INTERVAL_MS = 25_000;

declare global {
  var __mailpostTicker: ReturnType<typeof setInterval> | undefined;
  var __mailpostTicking: boolean | undefined;
}

export function ensureTicker() {
  if (globalThis.__mailpostTicker) return;
  globalThis.__mailpostTicker = setInterval(() => {
    if (globalThis.__mailpostTicking) return;
    const state = loadState();
    const running = (state.campaigns || []).some((c) => c.status === "running");
    const queued = (state.jobs || []).some((j) => j.status === "queued");
    if (!running || !queued) return;
    globalThis.__mailpostTicking = true;
    mutateState((current) => processQueue(current, 1))
      .catch(() => undefined)
      .finally(() => {
        globalThis.__mailpostTicking = false;
      });
  }, INTERVAL_MS);
  globalThis.__mailpostTicker.unref?.();
}
