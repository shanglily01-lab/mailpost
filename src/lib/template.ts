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

  const withoutUnsub = blob.replace(/\{\{\s*unsubUrl\s*\}\}/g, "");
  if (/https?:\/\//i.test(withoutUnsub) || /www\./i.test(withoutUnsub)) {
    gates.push({
      code: "TEMPLATE_PROMO",
      severity: "block",
      message: "检测到促销链接。冷邮件不要放落地页、图片或附件，系统只会自动附加退订地址。",
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

export function complianceFooter(
  settings: Settings,
  unsubUrl: string,
): string {
  return [
    "",
    "--",
    settings.companyName,
    settings.physicalAddress,
    `退订 Unsubscribe: ${unsubUrl}`,
  ].join("\n");
}
