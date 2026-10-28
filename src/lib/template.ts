import {
  PERSONALIZATION_KEYS,
  SPAMMY_PATTERNS,
} from "./constants";
import type { Contact, Gate, Settings } from "./types";

const VAR = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export function renderTemplate(
  text: string,
  contact: Contact,
  extras: Record<string, string> = {},
): string {
  const map: Record<string, string> = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    title: contact.title,
    industry: contact.industry,
    email: contact.email,
    ...extras,
  };
  return text.replace(VAR, (_, key: string) => map[key] ?? "");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buttonLabel(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "");
    return host || "打开链接";
  } catch {
    return "打开链接";
  }
}

function linkButton(href: string, label?: string): string {
  const text = escapeHtml((label || buttonLabel(href)).trim() || buttonLabel(href));
  const safeHref = escapeHtml(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;"><tr>` +
    `<td bgcolor="#111111" style="border-radius:8px;">` +
    `<a href="${safeHref}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:sans-serif;font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;">${text}</a>` +
    `</td></tr></table>`
  );
}

/** Plain-text URLs and Word-pasted [label](url) become button links. The text part keeps the same URL. */
export function textToHtml(text: string): string {
  const tokenRe = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(tokenRe)) {
    const index = match.index ?? 0;
    parts.push(escapeHtml(text.slice(last, index)).replace(/\n/g, "<br>\n"));
    if (match[1] && match[2]) {
      parts.push(linkButton(match[2], match[1]));
    } else {
      const raw = match[0];
      const url = raw.replace(/[.,;:!?)]+$/, "");
      const tail = raw.slice(url.length);
      const href = /^www\./i.test(url) ? `https://${url}` : url;
      parts.push(linkButton(href));
      if (tail) parts.push(escapeHtml(tail));
    }
    last = index + match[0].length;
  }
  parts.push(escapeHtml(text.slice(last)).replace(/\n/g, "<br>\n"));
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111111;">${parts.join("")}</div>`;
}

export function lintCopy(subject: string, body: string): Gate[] {
  const gates: Gate[] = [];
  const blob = `${subject}\n${body}`;

  const used = new Set<string>();
  for (const match of blob.matchAll(VAR)) used.add(match[1]);
  const personalized = PERSONALIZATION_KEYS.some((k) => used.has(k));
  if (!personalized) {
    gates.push({
      code: "TEMPLATE_NO_PERSONALIZATION",
      severity: "block",
      message:
        "正文或标题必须至少使用一个变量（如 {{firstName}} / {{company}}）。通用套话会被当作垃圾邮件。",
    });
  }

  if (SPAMMY_PATTERNS.some((re) => re.test(blob))) {
    gates.push({
      code: "TEMPLATE_SPAMMY",
      severity: "block",
      message: "检测到促销/诱导用语。冷邮件只允许纯文本、针对痛点提问，不要促销口吻。",
    });
  }

  if (/<img|cid:|\.(png|jpe?g|gif)\b/i.test(blob)) {
    gates.push({
      code: "TEMPLATE_PROMO",
      severity: "block",
      message: "检测到图片或附件痕迹。请改成纯文本。",
    });
  }

  return gates;
}

export function signatureFooter(settings: Settings, unsubUrl = ""): string {
  const lines = ["", "--"];
  if (settings.companyName.trim()) lines.push(settings.companyName.trim());
  if (settings.physicalAddress.trim()) lines.push(settings.physicalAddress.trim());
  if (unsubUrl) lines.push(`如不再需要这类邮件，打开：${unsubUrl}`);
  if (lines.length === 2) return "";
  return lines.join("\n");
}

/** @deprecated use signatureFooter */
export function complianceFooter(settings: Settings, unsubUrl: string): string {
  return signatureFooter(settings, unsubUrl);
}
