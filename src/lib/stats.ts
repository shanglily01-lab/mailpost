import { mailboxEffectiveCap, rates, resetSentToday, killReasons, contactSendable } from "./safety";
import type { AppState, Overview } from "./types";
import { warmupDayNumber } from "./warmup";

export function buildOverview(state: AppState, now = new Date()): Overview {
  const { bounceRate, spamRate, delivered } = rates(state);
  const mailboxes = state.mailboxes.map((m) => resetSentToday(m, now));
  const sentToday = mailboxes.reduce((n, m) => n + m.sentToday, 0);
  const dailyBudget = mailboxes.reduce((n, m) => n + mailboxEffectiveCap(m, now), 0);
  const kills = killReasons(state);

  return {
    bounceRate,
    spamRate,
    delivered,
    sentToday,
    dailyBudget,
    readyMailboxes: mailboxes.filter((m) => {
      const day = warmupDayNumber(m.warmupStartedAt, now);
      return m.status !== "paused" && day >= 22;
    }).length,
    warmingMailboxes: mailboxes.filter((m) => {
      const day = warmupDayNumber(m.warmupStartedAt, now);
      return m.status !== "paused" && day < 22;
    }).length,
    verifiedContacts: state.contacts.filter((c) => c.verification === "valid").length,
    sendableContacts: state.contacts.filter(
      (c) => contactSendable(c, state.settings.legalRegion).length === 0,
    ).length,
    runningCampaigns: state.campaigns.filter((c) => c.status === "running").length,
    killActive: kills.length > 0,
    killReasons: kills,
    sandbox: state.settings.sandboxMode,
  };
}
