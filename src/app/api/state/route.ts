import { NextResponse } from "next/server";
import { loadState } from "@/lib/store";
import { buildOverview } from "@/lib/stats";
import { mailboxEffectiveCap, resetSentToday } from "@/lib/safety";
import { warmupDayNumber, warmupProgress } from "@/lib/warmup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = loadState();
  const now = new Date();
  const mailboxes = state.mailboxes.map((m) => {
    const reset = resetSentToday(m, now);
    const day = warmupDayNumber(reset.warmupStartedAt, now);
    return {
      ...reset,
      smtpPass: reset.smtpPass ? "••••••" : "",
      warmupDay: day,
      warmupPct: warmupProgress(day),
      effectiveCap: mailboxEffectiveCap(reset, now),
    };
  });
  const domains = state.domains.map((d) => {
    const warmupDay = warmupDayNumber(d.warmupStartedAt, now);
    return {
      ...d,
      warmupDay,
      warmupPct: warmupProgress(warmupDay, d.warmupDaysRequired),
    };
  });

  return NextResponse.json({
    ...state,
    mailboxes,
    domains,
    overview: buildOverview(state, now),
  });
}
