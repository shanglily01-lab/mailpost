import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import type { AppState, Contact, Mailbox, SendJob, SequenceStep } from "./types";
import { renderTemplate, signatureFooter } from "./template";
import { nid, nowISO } from "./id";
import { dataDir } from "./store";

export function unsubUrl(state: AppState, contact: Contact): string {
  const base = state.settings.publicBaseUrl.replace(/\/$/, "");
  return `${base}/u/${contact.unsubToken}`;
}

export function isPublicHttpsBase(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host === "127.0.0.1") return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function publicUnsubUrl(state: AppState, contact: Contact): string {
  if (!isPublicHttpsBase(state.settings.publicBaseUrl)) return "";
  return unsubUrl(state, contact);
}

export function buildMessage(
  state: AppState,
  contact: Contact,
  step: SequenceStep,
): { subject: string; body: string } {
  const url = publicUnsubUrl(state, contact);
  const subject = renderTemplate(step.subject, contact);
  const body = renderTemplate(step.body, contact, { unsubUrl: url }) + signatureFooter(state.settings, url);
  return { subject, body };
}

function smtpPass(mailbox: Mailbox): string {
  return mailbox.smtpPass.replace(/\s+/g, "");
}

export function canLiveSend(mailbox: Mailbox): boolean {
  const host = mailbox.smtpHost.trim().toLowerCase();
  return Boolean(host && !host.includes("example.com") && smtpPass(mailbox));
}

function withPort(mailbox: Mailbox, port: number): Mailbox {
  return { ...mailbox, smtpPort: port, smtpSecure: port === 465 };
}

function portCandidates(mailbox: Mailbox): Mailbox[] {
  const host = mailbox.smtpHost.trim().toLowerCase();
  const primary = mailbox.smtpPort || 587;
  if (!host.includes("gmail")) return [withPort(mailbox, primary)];
  const alt = primary === 465 ? 587 : 465;
  return [withPort(mailbox, primary), withPort(mailbox, alt)];
}

function transportFor(mailbox: Mailbox) {
  const host = mailbox.smtpHost.trim();
  const port = mailbox.smtpPort || 587;
  const secure = port === 465 || mailbox.smtpSecure;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    family: 4,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    tls: {
      minVersion: "TLSv1.2",
      servername: host,
    },
    auth:
      mailbox.smtpUser || mailbox.smtpPass
        ? { user: mailbox.smtpUser, pass: smtpPass(mailbox) }
        : undefined,
  } as never);
}

function isRetryableSmtp(err: unknown): boolean {
  const raw = `${err instanceof Error ? err.message : String(err)} ${typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : ""}`;
  return /connection closed|econnection|etimedout|timeout|econnreset|econnrefused|socket closed/i.test(raw);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function explainSmtpError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const blob = raw.toLowerCase();
  if (blob.includes("invalid login") || blob.includes("eauth") || blob.includes("username and password not accepted") || blob.includes("535")) {
    return "Gmail 拒绝登录。必须用该邮箱自己的 16 位应用专用密码，不能用网页登录密码。到 Gmail 页更新后再发。";
  }
  if (isRetryableSmtp(err)) {
    return "连不上 Gmail SMTP（587/465）。本机请给 smtp.gmail.com 设 Clash 直连。服务器上请测 nc -vz smtp.gmail.com 587 和 465，安全组出站放行这两端口；AWS 默认只死卡 25，若 587 也不通要申请解除发信限制。";
  }
  return raw;
}

async function withSmtpRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetryableSmtp(err) || i === 2) throw err;
      await delay(700 * (i + 1));
    }
  }
  throw last;
}

async function tryPorts<T>(mailbox: Mailbox, fn: (box: Mailbox) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const candidate of portCandidates(mailbox)) {
    try {
      const result = await withSmtpRetry(() => fn(candidate));
      mailbox.smtpPort = candidate.smtpPort;
      mailbox.smtpSecure = candidate.smtpSecure;
      return result;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

export async function verifySmtp(mailbox: Mailbox): Promise<void> {
  await tryPorts(mailbox, async (box) => {
    const transporter = transportFor(box);
    try {
      await transporter.verify();
    } finally {
      transporter.close();
    }
  });
}

export async function deliver(opts: {
  state: AppState;
  mailbox: Mailbox;
  contact: Contact;
  subject: string;
  body: string;
  forceLive?: boolean;
  /** 群发才带退订头；一对一私人信不要带，否则容易进垃圾箱。 */
  kind?: "direct" | "bulk";
}): Promise<{ sandbox: boolean; path?: string }> {
  const kind = opts.kind ?? "direct";
  const unsub = kind === "bulk" ? publicUnsubUrl(opts.state, opts.contact) : "";
  const footer = signatureFooter(opts.state.settings, unsub);
  const body = footer ? `${opts.body}${opts.body.endsWith("\n") ? "" : "\n"}${footer}` : opts.body;
  const headers: Record<string, string> = {};
  if (unsub) headers["List-Unsubscribe"] = `<${unsub}>`;

  const live = opts.forceLive || (!opts.state.settings.sandboxMode && canLiveSend(opts.mailbox));
  if (!live) {
    const dir = path.join(dataDir(), "outbox");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${opts.contact.email.replace(/[^a-z0-9@._-]/gi, "_")}.txt`);
    writeFileSync(
      file,
      [
        `From: ${opts.mailbox.displayName} <${opts.mailbox.email}>`,
        `To: ${opts.contact.email}`,
        `Subject: ${opts.subject}`,
        "",
        body,
      ].join("\n"),
      "utf8",
    );
    return { sandbox: true, path: file };
  }

  await tryPorts(opts.mailbox, async (box) => {
    const transporter = transportFor(box);
    try {
      await transporter.sendMail({
        from: `"${box.displayName}" <${box.email}>`,
        to: opts.contact.email,
        subject: opts.subject,
        text: body,
        headers,
      });
    } finally {
      transporter.close();
    }
  });

  return { sandbox: false };
}

export function newJob(partial: Omit<SendJob, "id">): SendJob {
  return { id: nid(), ...partial };
}

export { nowISO };
