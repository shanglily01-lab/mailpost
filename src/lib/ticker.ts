import { processQueue } from "./actions";
import { mutateState } from "./store";

const INTERVAL_MS = 25_000;

declare global {
  var __mailpostTicker: ReturnType<typeof setInterval> | undefined;
  var __mailpostTicking: boolean | undefined;
}

export function ensureTicker() {
  if (globalThis.__mailpostTicker) return;
  globalThis.__mailpostTicker = setInterval(() => {
    if (globalThis.__mailpostTicking) return;
    globalThis.__mailpostTicking = true;
    mutateState((state) => {
      const running = state.campaigns.some((c) => c.status === "running");
      const queued = state.jobs.some((j) => j.status === "queued");
      if (!running || !queued) return { ok: true };
      return processQueue(state, 1);
    })
      .catch(() => undefined)
      .finally(() => {
        globalThis.__mailpostTicking = false;
      });
  }, INTERVAL_MS);
  globalThis.__mailpostTicker.unref?.();
}
