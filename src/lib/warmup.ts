import { MAX_DAILY_PER_MAILBOX } from "./constants";

/** Day count since the mailbox was added. Sending is not reduced by this. */
export function warmupDayNumber(startedAt: string, now = new Date()): number {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000) + 1);
}

export function warmupDailyCap(_day: number, _configuredCap: number): number {
  return MAX_DAILY_PER_MAILBOX;
}

export function warmupProgress(day: number, required = 21): number {
  return Math.max(0, Math.min(100, Math.round((day / required) * 100)));
}
