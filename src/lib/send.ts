import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import nodemailer from "nodemailer";
import type { AppState, Contact, Mailbox, SendJob, SequenceStep } from "./types";
import { complianceFooter, renderTemplate } from "./template";
import { nid, nowISO } from "./id";

export function unsubUrl(state: AppState, contact: Contact): string {
  const base = state.settings.publicBaseUrl.replace(/\/$/, "");
  return `${base}/u/${contact.unsubToken}`;
}

export function buildMessage(
  state: AppState,
  contact: Contact,
  step: SequenceStep,
): { subject: string; body: string } {
  const url = unsubUrl(state, contact);
  const subject = renderTemplate(step.subject, contact);
  const body =
    renderTemplate(step.body, contact, { unsubUrl: url }) +
    "\n" +
    complianceFooter(state.settings, url);
  return { subject, body };
}

function smtpPass(mailbox: Mailbox): string {
  return mailbox.smtpPass.replace(/\s+/g, "");
}

export function canLiveSend(mailbox: Mailbox): boolean {
  const host = mailbox.smtpHost.trim().toLowerCase();
  return Boolean(host && !host.includes("example.com") && smtpPass(mailbox));
}

export async function deliver(opts: {
  state: AppState;
  mailbox: Mailbox;
  contact: Contact;
  subject: string;
  body: string;
  forceLive?: boolean;
}): Promise<{ sandbox: boolean; path?: string }> {
  const live = opts.forceLive || (!opts.state.settings.sandboxMode && canLiveSend(opts.mailbox));
  if (!live) {
    const dir = path.join(process.cwd(), "data", "outbox");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${opts.contact.email.replace(/[^a-z0-9@._-]/gi, "_")}.txt`);
    writeFileSync(
      file,
      [
        `From: ${opts.mailbox.displayName} <${opts.mailbox.email}>`,
        `To: ${opts.contact.email}`,
        `Subject: ${opts.subject}`,
        "",
        opts.body,
      ].join("\n"),
      "utf8",
    );
    return { sandbox: true, path: file };
  }

  const host = opts.mailbox.smtpHost.trim();
  const port = opts.mailbox.smtpPort || 587;
  const secure = port === 465 || opts.mailbox.smtpSecure;
  const transporter = nodemailer.createTransport({
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
      opts.mailbox.smtpUser || opts.mailbox.smtpPass
        ? { user: opts.mailbox.smtpUser, pass: smtpPass(opts.mailbox) }
        : undefined,
  } as never);

  await transporter.sendMail({
    from: `"${opts.mailbox.displayName}" <${opts.mailbox.email}>`,
    to: opts.contact.email,
    subject: opts.subject,
    text: opts.body,
    headers: {
      "List-Unsubscribe": `<${unsubUrl(opts.state, opts.contact)}>`,
    },
  });

  return { sandbox: false };
}

export function newJob(partial: Omit<SendJob, "id">): SendJob {
  return { id: nid(), ...partial };
}

export { nowISO };
