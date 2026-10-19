import { promises as dns } from "dns";
import { DISPOSABLE_DOMAINS, ROLE_LOCAL_PARTS } from "./constants";
import type { Verification } from "./types";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isEmailAddress(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

export function findEmails(raw: string): string[] {
  const re = new RegExp(EMAIL_RE.source.slice(1, -1), "gi");
  const found = raw.match(re);
  return found ? found.map((email) => email.toLowerCase()) : [];
}

export type VerifyResult = {
  verification: Verification;
  note: string;
};

function split(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@");
  return { local: email.slice(0, at).toLowerCase(), domain: email.slice(at + 1).toLowerCase() };
}

export async function verifyEmail(raw: string): Promise<VerifyResult> {
  const email = raw.trim();
  if (!EMAIL_RE.test(email)) {
    return { verification: "invalid", note: "邮箱格式无效，硬退信风险。" };
  }

  const { local, domain } = split(email);

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { verification: "invalid", note: "一次性邮箱，几乎可以确定是垃圾名单或蜜罐。" };
  }

  if (/^[0-9a-f]{20,}$/i.test(local) || local.length > 40) {
    return {
      verification: "risky",
      note: "本地部分像随机哈希，常见于反垃圾蜜罐地址。",
    };
  }

  let mxOk = false;
  try {
    const mx = await dns.resolveMx(domain);
    mxOk = Array.isArray(mx) && mx.length > 0;
  } catch {
    mxOk = false;
  }

  if (!mxOk) {
    return { verification: "invalid", note: `域名 ${domain} 没有 MX 记录，会硬退信。` };
  }

  if (ROLE_LOCAL_PARTS.has(local)) {
    return {
      verification: "risky",
      note: "角色账号（info/sales 等）投诉率高，默认不进入外投队列。",
    };
  }

  return { verification: "valid", note: "语法、MX 均通过。仍建议用 ZeroBounce / NeverBounce 做二次验真。" };
}

export function looksPurchased(source: string): boolean {
  const s = source.trim().toLowerCase();
  return (
    s === "purchased" ||
    /购买|买的|买来|中介|黑市|数据包|邮箱包/.test(s) ||
    s.includes("purchased") ||
    s.includes("bought-list")
  );
}
