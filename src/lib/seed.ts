import { BOUNCE_KILL, SPAM_KILL, WARMUP_DAYS } from "./constants";
import { nid, nowISO } from "./id";
import type { AppState, Domain } from "./types";

export function gmailDomain(id = nid()): Domain {
  return {
    id,
    hostname: "gmail.com",
    purpose: "sending",
    spf: "pass",
    dkim: "pass",
    dkimSelector: "google",
    dmarc: "pass",
    warmupStartedAt: nowISO(),
    warmupDaysRequired: WARMUP_DAYS,
    status: "ready",
    notes: "Gmail SMTP，由 Google 签名。",
  };
}

export function seedState(): AppState {
  return {
    settings: {
      companyName: "",
      physicalAddress: "",
      primaryDomain: "gmail.com",
      legalRegion: "MULTI",
      bounceKillThreshold: BOUNCE_KILL,
      spamKillThreshold: SPAM_KILL,
      maxDailyPerMailbox: 50,
      sandboxMode: false,
      publicBaseUrl: "http://localhost:3000",
    },
    domains: [gmailDomain()],
    mailboxes: [],
    contacts: [],
    sequences: [],
    campaigns: [],
    jobs: [],
    activity: [],
    spamComplaints: 0,
    hardBounces: 0,
  };
}

function isGmailAddress(email: string): boolean {
  const e = email.toLowerCase();
  return e.endsWith("@gmail.com") || e.endsWith("@googlemail.com");
}

function hasDemoJunk(state: AppState): boolean {
  const blob = `${state.settings.companyName} ${state.settings.physicalAddress}`;
  if (/北境|Northbound|外马路/i.test(blob)) return true;
  if (state.contacts.some((c) => c.email.endsWith(".example") || c.email.endsWith(".invalid") || c.verifyNote.includes("演示数据"))) {
    return true;
  }
  if (state.sequences.some((s) => s.name.includes("采购痛点") || s.name.includes("北境"))) return true;
  return false;
}

/** Strip leftover demo records once. Never delete a real Gmail mailbox the user added. */
export function sanitizeState(state: AppState): boolean {
  const before = JSON.stringify(state);

  let domain = state.domains.find((d) => d.hostname === "gmail.com");
  if (!domain) {
    domain = gmailDomain();
    state.domains.push(domain);
  }

  for (const m of state.mailboxes) {
    if (!m.smtpHost) m.smtpHost = "smtp.gmail.com";
    if (!m.smtpPort) m.smtpPort = 587;
    if (!m.smtpUser) m.smtpUser = m.email;
    if (!m.domainId) m.domainId = domain.id;
  }

  if (!hasDemoJunk(state)) {
    return JSON.stringify(state) !== before;
  }

  state.domains = [domain];

  state.mailboxes = state.mailboxes
    .filter((m) => isGmailAddress(m.email) && (m.smtpHost.includes("gmail") || !m.smtpHost))
    .map((m) => ({
      ...m,
      domainId: domain.id,
      smtpHost: m.smtpHost || "smtp.gmail.com",
      smtpUser: m.smtpUser || m.email,
    }));

  const mailboxIds = new Set(state.mailboxes.map((m) => m.id));
  state.contacts = state.contacts.filter(
    (c) => !c.email.endsWith(".example") && !c.email.endsWith(".invalid") && !c.verifyNote.includes("演示数据"),
  );

  const contactIds = new Set(state.contacts.map((c) => c.id));
  state.jobs = state.jobs.filter((j) => mailboxIds.has(j.mailboxId) && (j.campaignId === "direct" || contactIds.has(j.contactId)));
  state.campaigns = (state.campaigns || []).filter(
    (c) =>
      c.mailboxIds.some((id) => mailboxIds.has(id)) &&
      !/北境|Northbound|demo|采购痛点/i.test(c.name),
  );
  for (const c of state.campaigns) {
    if (!c.kind) c.kind = c.subject ? "bulk" : "sequence";
    if (c.subject === undefined) c.subject = "";
    if (c.body === undefined) c.body = "";
  }
  state.sequences = state.sequences.filter((s) => !s.name.includes("采购痛点") && !s.name.includes("北境"));

  if (/北境|Northbound/i.test(state.settings.companyName)) {
    state.settings.companyName = state.mailboxes[0]?.displayName || "";
  }
  if (/北境|外马路/.test(state.settings.physicalAddress)) {
    state.settings.physicalAddress = "";
  }
  state.settings.primaryDomain = "gmail.com";
  state.settings.sandboxMode = false;

  const keepTitles = new Set(["已发送", "已添加邮箱", "已删除邮箱", "话术已保存", "联系人已添加", "群发已排队", "队列已处理", "群发已取消"]);
  state.activity = state.activity.filter(
    (a) => keepTitles.has(a.title) && !/northbound|北境|getnorthbound|try-northbound|ironvale|example/i.test(a.detail),
  );

  return JSON.stringify(state) !== before;
}
