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
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain-text URLs become real links in the HTML part. The text part keeps the same URL. */
export function textToHtml(text: string): string {
  const linked = escapeHtml(text).replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, (raw) => {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    const tail = raw.slice(url.length);
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    return `<a href="${href}">${url}</a>${tail}`;
  });
  return `<div>${linked.replace(/\n/g, "<br>\n")}</div>`;
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
