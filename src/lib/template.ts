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

function codePointChar(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Word stores emoji as &#127873; or &amp;#127873;. Turn those into the character. */
export function decodeHtmlEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i += 1) {
    const next = out
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (all, hex: string) => codePointChar(Number.parseInt(hex, 16), all))
      .replace(/&#(\d+);/g, (all, num: string) => codePointChar(Number(num), all));
    if (next === out) break;
    out = next;
  }
  return out;
}

function buttonLabel(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "");
    return host || "打开链接";
  } catch {
    return "打开链接";
  }
}

function inlineLink(href: string, label?: string): string {
  const text = escapeHtml((label || buttonLabel(href)).trim() || buttonLabel(href));
  const safeHref = escapeHtml(href);
  return `<a href="${safeHref}" target="_blank" style="display:inline-block;padding:2px 10px;margin:0 2px;background:#111111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;line-height:1.5;vertical-align:baseline;">${text}</a>`;
}

const EMOJI_ONLY = /^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+$/u;
const LEAD_EMOJI = /^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*/u;
const LABELED_URL = /^(?:\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(.+?)\s*\((https?:\/\/[^)\s]+)\))\s*$/;
const DASH_LINE = /^[—–-]/;

function isEmojiOnly(line: string): boolean {
  return EMOJI_ONLY.test(line.trim());
}

function labeledLink(line: string): { label: string; href: string } | null {
  const match = line.trim().match(LABELED_URL);
  if (!match) return null;
  const href = match[2] || match[4];
  const label = (match[1] || match[3] || "").trim();
  if (!href) return null;
  return { label, href };
}

/**
 * Word splits one sentence into an emoji line, a "label (url)" line, and a "— note" line.
 * Put them back on one line: emoji [label](url) — note.
 */
export function normalizeMailText(text: string): string {
  const raw = decodeHtmlEntities(text).replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const cur = raw[i].trim();
    if (!cur) {
      lines.push("");
      continue;
    }
    if (isEmojiOnly(cur)) {
      const next = raw[i + 1]?.trim() ?? "";
      const link = labeledLink(next);
      if (link) {
        const note = raw[i + 2]?.trim() ?? "";
        const dash = DASH_LINE.test(note) ? ` ${note}` : "";
        lines.push(`${cur} [${link.label}](${link.href})${dash}`);
        i += dash ? 2 : 1;
        continue;
      }
      if (next && !isEmojiOnly(next) && next.length <= 120 && !DASH_LINE.test(next)) {
        lines.push(`${cur} ${next}`);
        i += 1;
        continue;
      }
    }
    lines.push(cur);
  }
  return lines.join("\n");
}

function renderLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return `<div style="height:8px;line-height:8px;">&nbsp;</div>`;
  const tokenRe = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|([^\n[(]*?)\s*\((https?:\/\/[^)\s]+)\)|(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const parts: string[] = [];
  let last = 0;
  for (const match of trimmed.matchAll(tokenRe)) {
    const index = match.index ?? 0;
    if (index < last) continue;
    parts.push(escapeHtml(trimmed.slice(last, index)));
    const href = match[2] || match[4];
    const rawLabel = match[1] || match[3];
    if (href && rawLabel !== undefined) {
      const lead = LEAD_EMOJI.exec(rawLabel);
      if (lead && lead[0].length < rawLabel.length) {
        parts.push(`${escapeHtml(lead[1])} ${inlineLink(href, rawLabel.slice(lead[0].length))}`);
      } else {
        parts.push(inlineLink(href, rawLabel));
      }
      last = index + match[0].length;
      continue;
    }
    const raw = match[0];
    const url = raw.replace(/[.,;:!?)]+$/, "");
    const tail = raw.slice(url.length);
    const bareHref = /^www\./i.test(url) ? `https://${url}` : url;
    parts.push(inlineLink(bareHref));
    if (tail) parts.push(escapeHtml(tail));
    last = index + raw.length;
  }
  parts.push(escapeHtml(trimmed.slice(last)));
  return `<div style="margin:0 0 6px;">${parts.join("")}</div>`;
}

/** One line stays one line. Linked words become inline buttons; emoji stays beside them. */
export function textToHtml(text: string): string {
  const html = normalizeMailText(text).split("\n").map((line) => renderLine(line)).join("");
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#111111;">${html}</div>`;
}

/** Same wording as the HTML mail, without the raw addresses. */
export function toPlainMail(text: string): string {
  return normalizeMailText(text)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/([^\n]*?)\s*\((https?:\/\/[^)\s]+)\)/g, "$1");
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
