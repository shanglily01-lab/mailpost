import { BOUNCE_KILL, SPAM_KILL } from "./constants";
import { lintCopy } from "./template";
import type {
  AppState,
  Campaign,
  Contact,
  Domain,
  Gate,
  Mailbox,
  SequenceStep,
} from "./types";
import { warmupDailyCap, warmupDayNumber } from "./warmup";

export function rates(state: AppState): { bounceRate: number; spamRate: number; delivered: number } {
  const sent = state.jobs.filter((j) => j.status === "sent" || j.status === "bounced" || j.status === "replied").length;
  const bounced = state.jobs.filter((j) => j.status === "bounced" && j.bounceType === "hard").length + state.hardBounces;
  const delivered = Math.max(0, sent);
  const bounceRate = delivered === 0 ? 0 : bounced / delivered;
  const spamRate = delivered === 0 ? 0 : state.spamComplaints / delivered;
  return { bounceRate, spamRate, delivered };
}

export function killReasons(state: AppState): string[] {
  const { bounceRate, spamRate, delivered } = rates(state);
  const reasons: string[] = [];
  if (delivered >= 20 && bounceRate >= state.settings.bounceKillThreshold) {
    reasons.push(
      `硬退信率 ${(bounceRate * 100).toFixed(2)}% 已超过红线 ${(state.settings.bounceKillThreshold * 100).toFixed(0)}%。发信已熔断，保护域名。`,
    );
  }
  if (delivered >= 20 && spamRate >= state.settings.spamKillThreshold) {
    reasons.push(
      `投诉率 ${(spamRate * 100).toFixed(3)}% 已超过红线 ${(state.settings.spamKillThreshold * 100).toFixed(2)}%。发信已熔断。`,
    );
  }
  return reasons;
}

export function mailboxEffectiveCap(mailbox: Mailbox, now = new Date()): number {
  const day = warmupDayNumber(mailbox.warmupStartedAt, now);
  if (mailbox.status === "paused") return 0;
  return warmupDailyCap(day, mailbox.dailyCap);
}

export function resetSentToday(mailbox: Mailbox, now = new Date()): Mailbox {
  const today = now.toISOString().slice(0, 10);
  if (mailbox.sentTodayDate === today) return mailbox;
  return { ...mailbox, sentToday: 0, sentTodayDate: today };
}

export function contactSendable(contact: Contact, legalRegion: AppState["settings"]["legalRegion"]): Gate[] {
  const gates: Gate[] = [];
  if (contact.unsubscribed) {
    gates.push({ code: "UNSUBSCRIBED", severity: "block", message: `${contact.email} 已退订。` });
  }
  if (contact.suppressed) {
    gates.push({ code: "SUPPRESSED", severity: "block", message: `${contact.email} 在抑制名单中。` });
  }
  if (contact.source === "purchased") {
    gates.push({
      code: "PURCHASED_LIST",
      severity: "block",
      message: "禁止向购买的第三方名单发信。这是域名自杀，也违反平台与法规。",
    });
  }
  if (contact.verification === "unverified") {
    gates.push({ code: "UNVERIFIED", severity: "block", message: `${contact.email} 尚未验真。` });
  }
  if (contact.verification === "invalid") {
    gates.push({ code: "INVALID", severity: "block", message: `${contact.email} 验真失败，硬退信风险。` });
  }
  if (contact.verification === "risky") {
    gates.push({
      code: "RISKY",
      severity: "block",
      message: `${contact.email} 被标为高风险（角色账号或疑似蜜罐）。`,
    });
  }
  const regionLocked = legalRegion === "MULTI" || legalRegion === contact.region;
  if (contact.region === "CN" && regionLocked && contact.consent !== "explicit_opt_in") {
    gates.push({
      code: "NO_CONSENT_CN",
      severity: "block",
      message: "国内法规要求收件人明确同意。该联系人没有 Opt-in，不能发商业邮件。",
    });
  }
  if (contact.region === "EU" && regionLocked && contact.consent !== "explicit_opt_in") {
    gates.push({
      code: "NO_CONSENT_EU",
      severity: "block",
      message: "GDPR 要求明确知情同意。该欧盟联系人没有 Opt-in。",
    });
  }
  return gates;
}

export function evaluateSend(input: {
  state: AppState;
  campaign: Campaign;
  mailbox: Mailbox;
  domain: Domain;
  contact: Contact;
  step: SequenceStep;
  now?: Date;
}): Gate[] {
  const now = input.now ?? new Date();
  const { state, campaign, mailbox, domain, contact, step } = input;
  const gates: Gate[] = [];

  if (campaign.status !== "running") {
    gates.push({ code: "CAMPAIGN_NOT_RUNNING", severity: "block", message: "活动未在运行。" });
  }

  if (domain.purpose === "primary") {
    gates.push({
      code: "PRIMARY_DOMAIN",
      severity: "block",
      message: `禁止用主域名 ${domain.hostname} 外投。请使用完全隔离的备用域名。`,
    });
  }

  if (domain.spf !== "pass" || domain.dkim !== "pass" || domain.dmarc !== "pass") {
    gates.push({
      code: "DNS_INCOMPLETE",
      severity: "block",
      message: `${domain.hostname} 的 SPF / DKIM / DMARC 未全部通过，不能发信。`,
    });
  }

  const kills = killReasons(state);
  if (kills.length) {
    gates.push({ code: "BOUNCE_KILLED", severity: "block", message: kills[0] });
  }

  if (!state.settings.physicalAddress.trim()) {
    gates.push({
      code: "MISSING_ADDRESS",
      severity: "block",
      message: "CAN-SPAM 与合规页要求填写真实物理地址。",
    });
  }

  const mailboxNow = resetSentToday(mailbox, now);
  const cap = mailboxEffectiveCap(mailboxNow, now);
  if (cap <= 0) {
    gates.push({
      code: "WARMUP_CAP",
      severity: "block",
      message: `${mailbox.email} 养号未开始或已暂停，今日额度为 0。`,
    });
  } else if (mailboxNow.sentToday >= cap) {
    const day = warmupDayNumber(mailbox.warmupStartedAt, now);
    gates.push({
      code: day < 22 ? "WARMUP_CAP" : "DAILY_CAP",
      severity: "block",
      message: `${mailbox.email} 今日额度已用完（${mailboxNow.sentToday}/${cap}）。冷邮件每个邮箱每天最多 50 封。`,
    });
  }

  gates.push(...contactSendable(contact, state.settings.legalRegion));
  gates.push(...lintCopy(step.subject, step.body));

  if (state.settings.sandboxMode) {
    gates.push({
      code: "SANDBOX",
      severity: "warn",
      message: "沙箱模式：邮件写入本地发件箱，不会真正投递。",
    });
  }

  return gates;
}

export const DEFAULT_BOUNCE_KILL = BOUNCE_KILL;
export const DEFAULT_SPAM_KILL = SPAM_KILL;
