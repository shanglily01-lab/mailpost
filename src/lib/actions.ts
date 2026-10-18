import { IMPORT_ROW_CAP, MAX_DAILY_PER_MAILBOX, WARMUP_DAYS } from "./constants";
import { checkDomainAuth } from "./dns";
import { nid, nowISO, todayISO, token } from "./id";
import {
  contactSendable,
  evaluateSend,
  killReasons,
  mailboxEffectiveCap,
  resetSentToday,
} from "./safety";
import { buildMessage, canLiveSend, deliver, explainSmtpError, newJob, verifySmtp } from "./send";
import { pushLog } from "./store";
import { renderTemplate } from "./template";
import type {
  AppState,
  Campaign,
  Consent,
  Contact,
  ContactSource,
  Domain,
  DomainPurpose,
  IcpFit,
  Mailbox,
  Region,
  Sequence,
} from "./types";
import { looksPurchased, verifyEmail } from "./verify";
import { warmupDayNumber } from "./warmup";

export type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  data?: unknown;
};

function domainOf(state: AppState, mailbox: Mailbox): Domain | undefined {
  return state.domains.find((d) => d.id === mailbox.domainId);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function createDomain(
  state: AppState,
  input: { hostname: string; purpose: DomainPurpose; dkimSelector?: string },
): ActionResult {
  const hostname = input.hostname.trim().toLowerCase();
  if (!hostname || !hostname.includes(".")) return { ok: false, error: "请填写有效域名。" };
  if (state.domains.some((d) => d.hostname === hostname)) return { ok: false, error: "域名已存在。" };

  let purpose = input.purpose;
  if (hostname === state.settings.primaryDomain.toLowerCase()) purpose = "primary";

  const row: Domain = {
    id: nid(),
    hostname,
    purpose,
    spf: "unknown",
    dkim: "unknown",
    dkimSelector: input.dkimSelector?.trim() || "mail",
    dmarc: "unknown",
    warmupStartedAt: nowISO(),
    warmupDaysRequired: WARMUP_DAYS,
    status: purpose === "primary" ? "blocked" : "warming",
    notes: purpose === "primary" ? "主域名已锁定，不可外投。" : "",
  };
  state.domains.push(row);
  pushLog(
    state,
    purpose === "primary" ? "warn" : "ok",
    purpose === "primary" ? "主域名已锁定" : "已添加发信域",
    hostname,
  );
  return { ok: true, message: purpose === "primary" ? "这是主域名，系统禁止用它群发。" : "已添加。请配置 SPF / DKIM / DMARC 后再发信。" };
}

export async function checkDns(state: AppState, domainId: string): Promise<ActionResult> {
  const domain = state.domains.find((d) => d.id === domainId);
  if (!domain) return { ok: false, error: "域名不存在。" };
  const result = await checkDomainAuth(domain);
  Object.assign(domain, result);
  const ok = result.spf === "pass" && result.dkim === "pass" && result.dmarc === "pass";
  if (ok && domain.purpose === "sending" && domain.status === "warming") {
    const day = warmupDayNumber(domain.warmupStartedAt);
    if (day >= domain.warmupDaysRequired) domain.status = "ready";
  }
  pushLog(state, ok ? "ok" : "warn", `DNS 检查 ${domain.hostname}`, `SPF ${result.spf} · DKIM ${result.dkim} · DMARC ${result.dmarc}`);
  return { ok: true, data: result, message: ok ? "三条记录均通过。" : "仍有记录未通过，不能发信。" };
}

function ensureGmailDomain(state: AppState) {
  let domain = state.domains.find((d) => d.hostname === "gmail.com");
  if (!domain) {
    domain = {
      id: nid(),
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
    state.domains = [domain];
  }
  return domain;
}

export async function createMailbox(
  state: AppState,
  input: {
    email: string;
    displayName: string;
    smtpPass: string;
  },
): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
    return { ok: false, error: "只支持 Gmail（@gmail.com）。自定义域名目前发不了。" };
  }
  if (!input.smtpPass.trim()) return { ok: false, error: "请填写 Gmail 应用专用密码。" };
  if (state.mailboxes.some((m) => m.email === email)) return { ok: false, error: "这个 Gmail 已经接入了。" };

  const domain = ensureGmailDomain(state);
  const row: Mailbox = {
    id: nid(),
    domainId: domain.id,
    email,
    displayName: input.displayName.trim() || email.split("@")[0],
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: email,
    smtpPass: input.smtpPass.trim(),
    dailyCap: 40,
    sentToday: 0,
    sentTodayDate: todayISO(),
    warmupStartedAt: nowISO(),
    status: "warming",
  };
  try {
    await verifySmtp(row);
  } catch (err) {
    return { ok: false, error: `没接入成功：${explainSmtpError(err)}` };
  }
  state.mailboxes.push(row);
  if (!state.settings.companyName) state.settings.companyName = row.displayName;
  pushLog(state, "ok", "已添加邮箱", email);
  return { ok: true, message: `已接入 ${email}，SMTP 验证通过。前 3 天每天最多 5 封。写信页请选中这个邮箱再发。` };
}

export async function updateMailbox(
  state: AppState,
  input: { id: string; displayName?: string; smtpPass?: string },
): Promise<ActionResult> {
  const row = state.mailboxes.find((m) => m.id === input.id);
  if (!row) return { ok: false, error: "邮箱不存在。" };
  if (input.displayName !== undefined) row.displayName = input.displayName.trim() || row.displayName;
  if (input.smtpPass?.trim()) {
    const nextPass = input.smtpPass.trim();
    try {
      await verifySmtp({ ...row, smtpPass: nextPass });
    } catch (err) {
      return { ok: false, error: `密码没更新：${explainSmtpError(err)}` };
    }
    row.smtpPass = nextPass;
  }
  return { ok: true, message: "已更新。" };
}

export function deleteMailbox(state: AppState, id: string): ActionResult {
  const row = state.mailboxes.find((m) => m.id === id);
  if (!row) return { ok: false, error: "邮箱不存在。" };

  let skipped = 0;
  for (const job of state.jobs.filter((j) => j.mailboxId === id && j.status === "queued")) {
    job.status = "skipped";
    job.blockReason = "发件邮箱已删除";
    skipped += 1;
  }

  for (const campaign of state.campaigns) {
    if (!campaign.mailboxIds.includes(id)) continue;
    campaign.mailboxIds = campaign.mailboxIds.filter((mid) => mid !== id);
    if (campaign.mailboxIds.length === 0 && (campaign.status === "running" || campaign.status === "paused")) {
      campaign.status = "completed";
      campaign.killReason = campaign.killReason || "发件邮箱已删除";
    }
  }

  state.mailboxes = state.mailboxes.filter((m) => m.id !== id);
  pushLog(state, "warn", "已删除邮箱", skipped ? `${row.email} · 取消排队 ${skipped} 封` : row.email);
  return { ok: true, message: skipped ? `已删除 ${row.email}，并取消排队 ${skipped} 封。` : `已删除 ${row.email}。` };
}

export function createContact(
  state: AppState,
  input: Partial<Contact> & { email: string },
): ActionResult {
  if (looksPurchased(String(input.source ?? ""))) {
    return { ok: false, error: "拒绝购买名单。请改用 Apollo / ZoomInfo 等 B2B 库按岗位筛选，并二次验真。" };
  }
  const email = input.email.trim().toLowerCase();
  if (state.contacts.some((c) => c.email === email)) return { ok: false, error: "联系人已存在。" };
  const row: Contact = {
    id: nid(),
    email,
    firstName: input.firstName?.trim() || "",
    lastName: input.lastName?.trim() || "",
    title: input.title?.trim() || "",
    company: input.company?.trim() || "",
    industry: input.industry?.trim() || "",
    icpFit: (input.icpFit as IcpFit) || "medium",
    source: "manual",
    verification: "unverified",
    verifyNote: "尚未验真。",
    consent: (input.consent as Consent) || "implied_b2b",
    region: (input.region as Region) || "US",
    unsubscribed: false,
    suppressed: false,
    unsubToken: token(),
    notes: input.notes?.trim() || "",
    createdAt: nowISO(),
  };
  state.contacts.push(row);
  pushLog(state, "ok", "联系人已添加", email);
  return { ok: true, message: "已添加。" };
}

export function deleteContact(state: AppState, id: string): ActionResult {
  const n = state.contacts.length;
  state.contacts = state.contacts.filter((c) => c.id !== id);
  if (state.contacts.length === n) return { ok: false, error: "联系人不存在。" };
  return { ok: true, message: "已删除。" };
}

export function importContacts(
  state: AppState,
  input: { csv: string; source: ContactSource; defaultRegion: Region },
): ActionResult {
  if (input.source === "purchased" || looksPurchased(input.source)) {
    return {
      ok: false,
      error:
        "已拦截：系统拒绝导入购买的第三方名单。买名单会撞上蜜罐、推高退信，并把域名送进黑名单。请改用 B2B 数据库按 ICP 筛选。",
    };
  }
  const lines = input.csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: "CSV 为空。" };
  if (lines.length - 1 > IMPORT_ROW_CAP) {
    return { ok: false, error: `单次最多导入 ${IMPORT_ROW_CAP} 行。精耕细作，不要一次倒几万行。` };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const emailIdx = idx("email");
  if (emailIdx < 0) return { ok: false, error: "CSV 需要 email 列。" };

  let added = 0;
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const email = (cols[emailIdx] || "").toLowerCase();
    if (!email || state.contacts.some((c) => c.email === email)) {
      skipped += 1;
      continue;
    }
    const src = (cols[idx("source")] as ContactSource) || input.source;
    if (src === "purchased" || looksPurchased(src)) {
      return { ok: false, error: `行内来源为购买名单（${email}）。整批已拒绝。` };
    }
    state.contacts.push({
      id: nid(),
      email,
      firstName: cols[idx("firstname")] || cols[idx("first_name")] || "",
      lastName: cols[idx("lastname")] || cols[idx("last_name")] || "",
      title: cols[idx("title")] || "",
      company: cols[idx("company")] || "",
      industry: cols[idx("industry")] || "",
      icpFit: ((cols[idx("icpfit")] || cols[idx("icp")] || "medium") as IcpFit) || "medium",
      source: src,
      verification: "unverified",
      verifyNote: "导入后待验真。",
      consent: ((cols[idx("consent")] as Consent) || "none") as Consent,
      region: ((cols[idx("region")] as Region) || input.defaultRegion) as Region,
      unsubscribed: false,
      suppressed: false,
      unsubToken: token(),
      notes: cols[idx("notes")] || "",
      createdAt: nowISO(),
    });
    added += 1;
  }
  pushLog(state, "ok", "联系人导入", `新增 ${added}，跳过 ${skipped}。全部待验真。`);
  return { ok: true, message: `新增 ${added} 人，跳过 ${skipped}。请先跑验真再进活动。` };
}

export async function verifyContacts(state: AppState, ids?: string[]): Promise<ActionResult> {
  const targets = state.contacts.filter((c) => (ids?.length ? ids.includes(c.id) : c.verification === "unverified"));
  let valid = 0;
  let bad = 0;
  for (const c of targets) {
    const r = await verifyEmail(c.email);
    c.verification = r.verification;
    c.verifyNote = r.note;
    if (r.verification === "valid") valid += 1;
    else bad += 1;
  }
  pushLog(state, "info", "验真完成", `通过 ${valid}，拦截 ${bad}。`);
  return { ok: true, message: `验真完成：通过 ${valid}，拦截 ${bad}。` };
}

export function saveSequence(
  state: AppState,
  input: { id?: string; name: string; steps: Sequence["steps"] },
): ActionResult {
  if (!input.steps?.length) return { ok: false, error: "至少需要一封话术。" };
  if (input.steps.some((s) => !s.subject.trim() || !s.body.trim())) {
    return { ok: false, error: "每封话术都要有标题和正文。" };
  }
  const existing = input.id ? state.sequences.find((s) => s.id === input.id) : undefined;
  if (existing) {
    existing.name = input.name.trim() || existing.name;
    existing.steps = input.steps;
    existing.updatedAt = nowISO();
    pushLog(state, "ok", "话术已保存", existing.name);
    return { ok: true, message: "话术已更新。", data: { id: existing.id } };
  }
  const id = nid();
  const name = input.name.trim() || "未命名话术";
  state.sequences.push({
    id,
    name,
    steps: input.steps,
    updatedAt: nowISO(),
  });
  pushLog(state, "ok", "话术已保存", name);
  return { ok: true, message: "话术已保存。", data: { id } };
}

export function deleteSequence(state: AppState, id: string): ActionResult {
  const n = state.sequences.length;
  state.sequences = state.sequences.filter((s) => s.id !== id);
  if (state.sequences.length === n) return { ok: false, error: "话术不存在。" };
  return { ok: true, message: "已删除。" };
}

export function createCampaign(
  state: AppState,
  input: { name: string; sequenceId: string; mailboxIds: string[]; contactIds: string[] },
): ActionResult {
  if (!input.sequenceId) return { ok: false, error: "请选择序列。" };
  if (!input.mailboxIds.length) return { ok: false, error: "请选择发信邮箱。" };
  if (!input.contactIds.length) return { ok: false, error: "请选择受众。" };
  const row: Campaign = {
    id: nid(),
    name: input.name.trim() || "未命名活动",
    kind: "sequence",
    sequenceId: input.sequenceId,
    mailboxIds: input.mailboxIds,
    contactIds: input.contactIds,
    status: "draft",
    killReason: "",
    createdAt: nowISO(),
    launchedAt: null,
  };
  state.campaigns.push(row);
  return { ok: true, data: { id: row.id }, message: "草稿已保存。启动前会跑预检。" };
}

export function preflightCampaign(state: AppState, campaignId: string): ActionResult {
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: "活动不存在。" };
  const sequence = state.sequences.find((s) => s.id === campaign.sequenceId);
  if (!sequence) return { ok: false, error: "序列丢失。" };

  const blockers: string[] = [];
  const warnings: string[] = [];
  const sendable: string[] = [];

  const kills = killReasons(state);
  blockers.push(...kills);

  for (const mid of campaign.mailboxIds) {
    const mailbox = state.mailboxes.find((m) => m.id === mid);
    if (!mailbox) {
      blockers.push("有邮箱已被删除。");
      continue;
    }
    const domain = domainOf(state, mailbox);
    if (!domain) {
      blockers.push(`${mailbox.email} 没有绑定域名。`);
      continue;
    }
    const fake = { ...campaign, status: "running" as const };
    const gates = evaluateSend({
      state,
      campaign: fake,
      mailbox,
      domain,
      contact: {
        id: "_",
        email: "probe@example.com",
        firstName: "Sam",
        lastName: "",
        title: "经理",
        company: "Example",
        industry: "制造",
        icpFit: "high",
        source: "b2b_db",
        verification: "valid",
        verifyNote: "",
        consent: "implied_b2b",
        region: "US",
        unsubscribed: false,
        suppressed: false,
        unsubToken: "x",
        notes: "",
        createdAt: nowISO(),
      },
      step: sequence.steps[0],
    });
    for (const g of gates) {
      if (g.code === "UNVERIFIED" || g.code === "INVALID" || g.code === "RISKY" || g.code === "UNSUBSCRIBED" || g.code === "SUPPRESSED" || g.code === "NO_CONSENT_CN" || g.code === "NO_CONSENT_EU" || g.code === "PURCHASED_LIST") continue;
      const line = `${mailbox.email}: ${g.message}`;
      if (g.severity === "block" && !blockers.includes(line)) blockers.push(line);
      if (g.severity === "warn" && !warnings.includes(g.message)) warnings.push(g.message);
    }
  }

  for (const cid of campaign.contactIds) {
    const contact = state.contacts.find((c) => c.id === cid);
    if (!contact) continue;
    const g = contactSendable(contact, state.settings.legalRegion);
    if (g.length === 0) sendable.push(cid);
  }

  if (sendable.length === 0) blockers.push("受众里没有可发送的联系人（验真、同意、抑制名单均需满足）。");

  return {
    ok: blockers.length === 0,
    error: blockers[0],
    data: { blockers, warnings, sendableCount: sendable.length, total: campaign.contactIds.length },
    message: blockers.length ? blockers[0] : `预检通过，可触达 ${sendable.length} 人。`,
  };
}

export function launchCampaign(state: AppState, campaignId: string): ActionResult {
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: "活动不存在。" };
  const pf = preflightCampaign(state, campaignId);
  if (!pf.ok) return pf;

  const sequence = state.sequences.find((s) => s.id === campaign.sequenceId)!;
  const sendable = campaign.contactIds.filter((id) => {
    const c = state.contacts.find((x) => x.id === id);
    return c && contactSendable(c, state.settings.legalRegion).length === 0;
  });

  campaign.status = "running";
  campaign.launchedAt = nowISO();
  campaign.contactIds = sendable;

  const mailboxes = campaign.mailboxIds
    .map((id) => state.mailboxes.find((m) => m.id === id))
    .filter((m): m is Mailbox => Boolean(m));

  const start = nowISO();
  sendable.forEach((contactId, i) => {
    const mailbox = mailboxes[i % mailboxes.length];
    const contact = state.contacts.find((c) => c.id === contactId)!;
    let cursor = start;
    sequence.steps.forEach((step, stepIndex) => {
      if (stepIndex === 0) cursor = start;
      else cursor = addDays(cursor, step.delayDays);
      const msg = buildMessage(state, contact, step);
      state.jobs.push(
        newJob({
          campaignId: campaign.id,
          contactId,
          mailboxId: mailbox.id,
          stepIndex,
          scheduledAt: cursor,
          sentAt: null,
          status: "queued",
          bounceType: null,
          blockReason: "",
          subject: msg.subject,
          preview: msg.body.slice(0, 180),
        }),
      );
    });
  });

  pushLog(state, "ok", `活动已启动：${campaign.name}`, `排队 ${sendable.length} 人 × ${sequence.steps.length} 步。额度仍按邮箱日限额消耗。`);
  return { ok: true, message: `已启动。${sendable.length} 人进入队列，不会一次打出。` };
}

export function pauseCampaign(state: AppState, campaignId: string, resume = false): ActionResult {
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: "群发任务不存在。" };
  campaign.status = resume ? "running" : "paused";
  return { ok: true, message: resume ? "已继续排队发送。" : "已暂停，剩余的不会发出。" };
}

export function cancelBlast(state: AppState, campaignId: string): ActionResult {
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return { ok: false, error: "群发任务不存在。" };
  campaign.status = campaign.status === "running" || campaign.status === "paused" ? "paused" : campaign.status;
  let n = 0;
  for (const job of state.jobs.filter((j) => j.campaignId === campaignId && j.status === "queued")) {
    job.status = "skipped";
    job.blockReason = "已取消";
    n += 1;
  }
  if (!state.jobs.some((j) => j.campaignId === campaignId && j.status === "queued")) {
    campaign.status = "completed";
  }
  pushLog(state, "warn", "群发已取消", `${campaign.name} · 取消剩余 ${n} 封`);
  return { ok: true, message: n ? `已取消剩余 ${n} 封。` : "没有排队中的信件。" };
}

function isBulkCampaign(campaign: Campaign): boolean {
  return campaign.kind === "bulk" || Boolean(campaign.subject && !campaign.sequenceId);
}

export async function startBulk(
  state: AppState,
  input: { mailboxId: string; contactIds: string[]; subject: string; body: string; name?: string },
): Promise<ActionResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) return { ok: false, error: "标题和正文都要填。" };

  const mailbox0 = state.mailboxes.find((m) => m.id === input.mailboxId);
  if (!mailbox0) return { ok: false, error: "请选择发件邮箱。" };
  if (!canLiveSend(mailbox0)) return { ok: false, error: "这个邮箱还没配好真实 SMTP（主机 + 授权码）。" };

  const now = new Date();
  const mailbox = resetSentToday(mailbox0, now);
  Object.assign(mailbox0, mailbox);
  const cap = mailboxEffectiveCap(mailbox0, now);
  const left = Math.max(0, cap - mailbox0.sentToday);

  const seen = new Set<string>();
  const sendable: Contact[] = [];
  const skipped: string[] = [];
  for (const id of input.contactIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const contact = state.contacts.find((c) => c.id === id);
    if (!contact) {
      skipped.push("有联系人已被删除");
      continue;
    }
    if (contact.unsubscribed || contact.suppressed) {
      skipped.push(`${contact.email} 已退订或在抑制名单`);
      continue;
    }
    if (contact.source === "purchased") {
      skipped.push(`${contact.email} 来自购买名单，拒绝发送`);
      continue;
    }
    sendable.push(contact);
  }

  if (!sendable.length) return { ok: false, error: "没有可发的联系人。退订、抑制和购买名单会被跳过。" };
  if (sendable.length > IMPORT_ROW_CAP) {
    return { ok: false, error: `一次最多 ${IMPORT_ROW_CAP} 人，请拆开再发。` };
  }

  const campaign: Campaign = {
    id: nid(),
    name: input.name?.trim() || subject.slice(0, 24) || "群发",
    sequenceId: "",
    mailboxIds: [mailbox0.id],
    contactIds: sendable.map((c) => c.id),
    status: "running",
    killReason: "",
    createdAt: nowISO(),
    launchedAt: nowISO(),
    kind: "bulk",
    subject,
    body,
  };
  state.campaigns.push(campaign);

  for (const contact of sendable) {
    const rendered = renderTemplate(subject, contact);
    state.jobs.push(
      newJob({
        campaignId: campaign.id,
        contactId: contact.id,
        mailboxId: mailbox0.id,
        stepIndex: 0,
        scheduledAt: nowISO(),
        sentAt: null,
        status: "queued",
        bounceType: null,
        blockReason: "",
        subject: rendered,
        preview: body.slice(0, 180),
      }),
    );
  }

  const skipNote = skipped.length ? `跳过 ${skipped.length} 人。` : "";
  pushLog(
    state,
    "ok",
    "群发已排队",
    `${campaign.name} · ${sendable.length} 人 · 今日额度还剩 ${left} 封。${skipNote}`,
  );

  const tick = await processQueue(state, 1);
  const remain = state.jobs.filter((j) => j.campaignId === campaign.id && j.status === "queued").length;
  return {
    ok: true,
    message: `已排队 ${sendable.length} 人。${skipNote}今日还能发 ${left} 封，多出的次日自动继续。约每 25 秒发一封。${tick.message ?? ""}剩余排队 ${remain}。`,
    data: { id: campaign.id, queued: sendable.length, skipped: skipped.length, todayLeft: left },
  };
}

export async function processQueue(state: AppState, limit = 8): Promise<ActionResult> {
  const kills = killReasons(state);
  if (kills.length) {
    for (const c of state.campaigns.filter((x) => x.status === "running")) {
      c.status = "killed";
      c.killReason = kills[0];
    }
    pushLog(state, "danger", "熔断", kills[0]);
    return { ok: false, error: kills[0] };
  }

  const due = state.jobs
    .filter((j) => j.status === "queued" && new Date(j.scheduledAt).getTime() <= Date.now())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  let sent = 0;
  let blocked = 0;
  const now = new Date();

  for (const job of due) {
    if (sent >= limit) break;
    const campaign = state.campaigns.find((c) => c.id === job.campaignId);
    const mailbox0 = state.mailboxes.find((m) => m.id === job.mailboxId);
    const contact = state.contacts.find((c) => c.id === job.contactId);
    if (!campaign || !mailbox0 || !contact) {
      job.status = "skipped";
      job.blockReason = "数据缺失";
      continue;
    }
    if (campaign.status === "paused") continue;
    if (campaign.status !== "running") {
      job.status = "skipped";
      job.blockReason = "活动未运行";
      continue;
    }
    const mailbox = resetSentToday(mailbox0, now);
    Object.assign(mailbox0, mailbox);

    if (contact.unsubscribed || contact.suppressed) {
      job.status = "skipped";
      job.blockReason = "已退订或抑制";
      continue;
    }

    const cap = mailboxEffectiveCap(mailbox0, now);
    if (cap <= 0 || mailbox0.sentToday >= cap) continue;

    if (isBulkCampaign(campaign)) {
      if (!canLiveSend(mailbox0)) {
        job.status = "blocked";
        job.blockReason = "SMTP 未配置";
        blocked += 1;
        continue;
      }
      const subjectRendered = renderTemplate(campaign.subject || job.subject, contact);
      const fullBody = renderTemplate(campaign.body || "", contact);
      try {
        await deliver({
          state,
          mailbox: mailbox0,
          contact,
          subject: subjectRendered,
          body: fullBody,
          forceLive: true,
          kind: "bulk",
        });
      } catch (err) {
        job.status = "blocked";
        job.blockReason = explainSmtpError(err);
        blocked += 1;
        continue;
      }
      job.status = "sent";
      job.sentAt = nowISO();
      job.subject = subjectRendered;
      job.preview = (campaign.body || "").slice(0, 180);
      mailbox0.sentToday += 1;
      sent += 1;
      continue;
    }

    const domain = domainOf(state, mailbox0);
    const sequence = state.sequences.find((s) => s.id === campaign.sequenceId);
    const step = sequence?.steps[job.stepIndex];
    if (!domain || !step) {
      job.status = "blocked";
      job.blockReason = "域名或步骤缺失";
      blocked += 1;
      continue;
    }

    const gates = evaluateSend({ state, campaign, mailbox: mailbox0, domain, contact, step, now });
    const hard = gates.filter((g) => g.severity === "block");
    if (hard.length) {
      job.status = "blocked";
      job.blockReason = hard[0].message;
      blocked += 1;
      continue;
    }

    const msg = buildMessage(state, contact, step);
    try {
      await deliver({ state, mailbox: mailbox0, contact, subject: msg.subject, body: msg.body });
    } catch (err) {
      job.status = "blocked";
      job.blockReason = explainSmtpError(err);
      blocked += 1;
      continue;
    }

    job.status = "sent";
    job.sentAt = nowISO();
    job.subject = msg.subject;
    job.preview = msg.body.slice(0, 180);
    mailbox0.sentToday += 1;
    sent += 1;
  }

  for (const c of state.campaigns.filter((x) => x.status === "running" || x.status === "paused")) {
    const related = state.jobs.filter((j) => j.campaignId === c.id);
    if (related.length && related.every((j) => j.status !== "queued")) {
      c.status = "completed";
    }
  }

  if (sent > 0 || blocked > 0) {
    pushLog(state, sent > 0 ? "ok" : "warn", "队列已处理", `投递 ${sent}，拦截 ${blocked}。`);
  }
  return {
    ok: true,
    message: sent || blocked ? `本轮投递 ${sent} 封，拦截 ${blocked} 封。` : "本轮没有可发的信（额度用完则等到明天）。",
    data: { sent, blocked, remaining: state.jobs.filter((j) => j.status === "queued").length },
  };
}

export function updateSettings(state: AppState, patch: Partial<AppState["settings"]>): ActionResult {
  if (typeof patch.maxDailyPerMailbox === "number") {
    patch.maxDailyPerMailbox = Math.min(MAX_DAILY_PER_MAILBOX, Math.max(1, patch.maxDailyPerMailbox));
  }
  Object.assign(state.settings, patch);
  if (state.settings.bounceKillThreshold > 0.05) state.settings.bounceKillThreshold = 0.05;
  if (state.settings.spamKillThreshold > 0.003) state.settings.spamKillThreshold = 0.003;
  pushLog(state, "info", "合规设置已更新", state.settings.companyName);
  return { ok: true, message: "已保存。" };
}

export function markJob(
  state: AppState,
  input: { jobId: string; status: "bounced" | "replied" | "unsubscribed"; bounceType?: "hard" | "soft" },
): ActionResult {
  const job = state.jobs.find((j) => j.id === input.jobId);
  if (!job) return { ok: false, error: "记录不存在。" };
  job.status = input.status;
  if (input.status === "bounced") {
    job.bounceType = input.bounceType || "hard";
    if (job.bounceType === "hard") {
      const contact = state.contacts.find((c) => c.id === job.contactId);
      if (contact) contact.suppressed = true;
      state.hardBounces += 1;
    }
  }
  if (input.status === "unsubscribed") {
    const contact = state.contacts.find((c) => c.id === job.contactId);
    if (contact) contact.unsubscribed = true;
  }
  const kills = killReasons(state);
  if (kills.length) {
    for (const c of state.campaigns.filter((x) => x.status === "running")) {
      c.status = "killed";
      c.killReason = kills[0];
    }
    pushLog(state, "danger", "熔断", kills[0]);
  }
  return { ok: true };
}

export function unsubscribeByToken(state: AppState, unsubToken: string): ActionResult {
  const contact = state.contacts.find((c) => c.unsubToken === unsubToken);
  if (!contact) return { ok: false, error: "链接无效。" };
  contact.unsubscribed = true;
  for (const job of state.jobs.filter((j) => j.contactId === contact.id && j.status === "queued")) {
    job.status = "unsubscribed";
  }
  pushLog(state, "warn", "退订", contact.email);
  return { ok: true, message: "已退订，不会再收到来自本工作台的邮件。" };
}

export async function sendOnce(
  state: AppState,
  input: { mailboxId: string; to: string; firstName?: string; subject: string; body: string },
): Promise<ActionResult> {
  const to = input.to.trim().toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!to || !subject || !body) return { ok: false, error: "收件人、标题、正文都要填。" };

  const mailbox0 = state.mailboxes.find((m) => m.id === input.mailboxId);
  if (!mailbox0) return { ok: false, error: "请选择发件邮箱。" };
  const now = new Date();
  const mailbox = resetSentToday(mailbox0, now);
  Object.assign(mailbox0, mailbox);

  if (!canLiveSend(mailbox0)) {
    return { ok: false, error: "这个邮箱还没配好真实 SMTP（主机 + 授权码）。演示邮箱发不出去。" };
  }

  const cap = mailboxEffectiveCap(mailbox0, now);
  if (cap <= 0 || mailbox0.sentToday >= cap) {
    return { ok: false, error: `今日额度已用完（${mailbox0.sentToday}/${cap}）。养号期每天只能发几封。` };
  }

  let contact = state.contacts.find((c) => c.email === to);
  if (!contact) {
    const checked = await verifyEmail(to);
    if (checked.verification === "invalid") {
      return { ok: false, error: `收件人验不过：${checked.note}` };
    }
    contact = {
      id: nid(),
      email: to,
      firstName: input.firstName?.trim() || to.split("@")[0],
      lastName: "",
      title: "",
      company: "",
      industry: "",
      icpFit: "medium",
      source: "manual",
      verification: checked.verification === "risky" ? "valid" : checked.verification,
      verifyNote: checked.note,
      consent: "implied_b2b",
      region: "US",
      unsubscribed: false,
      suppressed: false,
      unsubToken: token(),
      notes: "写信页直接发送",
      createdAt: nowISO(),
    };
    state.contacts.push(contact);
  }
  if (contact.unsubscribed || contact.suppressed) {
    return { ok: false, error: "这个地址已退订或在抑制名单里，不能再发。" };
  }

  if (input.firstName?.trim()) contact.firstName = input.firstName.trim();
  const subjectRendered = renderTemplate(subject, contact);
  const fullBody = renderTemplate(body, contact);

  try {
    await deliver({
      state,
      mailbox: mailbox0,
      contact,
      subject: subjectRendered,
      body: fullBody,
      forceLive: true,
      kind: "direct",
    });
  } catch (err) {
    const message = explainSmtpError(err);
    pushLog(state, "danger", "发送失败", message);
    return { ok: false, error: `没发出去：${message}` };
  }

  mailbox0.sentToday += 1;
  state.jobs.push(
    newJob({
      campaignId: "direct",
      contactId: contact.id,
      mailboxId: mailbox0.id,
      stepIndex: 0,
      scheduledAt: nowISO(),
      sentAt: nowISO(),
      status: "sent",
      bounceType: null,
      blockReason: "",
      subject: subjectRendered,
      preview: body.slice(0, 180),
    }),
  );
  pushLog(state, "ok", "已发送", `${mailbox0.email} → ${to}`);
  return {
    ok: true,
    message: `已从 ${mailbox0.email} 发给 ${to}。今日还剩 ${cap - mailbox0.sentToday} 封。`,
  };
}

export function reportSpam(state: AppState): ActionResult {
  state.spamComplaints += 1;
  const kills = killReasons(state);
  if (kills.length) {
    for (const c of state.campaigns.filter((x) => x.status === "running")) {
      c.status = "killed";
      c.killReason = kills[0];
    }
  }
  pushLog(state, "danger", "垃圾邮件投诉", `累计 ${state.spamComplaints} 次。红线 ${(state.settings.spamKillThreshold * 100).toFixed(2)}%。`);
  return { ok: true };
}

export { mailboxEffectiveCap };
