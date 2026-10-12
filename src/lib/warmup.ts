import { MAX_DAILY_PER_MAILBOX } from "./constants";

/** Day 0 cannot send. Caps ramp across 3 weeks, never above 50. */
export function warmupDayNumber(startedAt: string, now = new Date()): number {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000) + 1);
}

export function warmupDailyCap(day: number, configuredCap: number): number {
  const hard = Math.min(configuredCap, MAX_DAILY_PER_MAILBOX);
  if (day < 1) return 0;
  if (day <= 3) return Math.min(5, hard);
  if (day <= 7) return Math.min(10, hard);
  if (day <= 14) return Math.min(20, hard);
  if (day <= 21) return Math.min(30, hard);
  return hard;
}

export function warmupProgress(day: number, required = 21): number {
  return Math.max(0, Math.min(100, Math.round((day / required) * 100)));
}
