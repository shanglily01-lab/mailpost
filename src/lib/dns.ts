import { promises as dns } from "dns";
import type { DnsStatus, Domain } from "./types";

async function txtAt(host: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(host);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export async function checkDomainAuth(domain: Domain): Promise<Pick<Domain, "spf" | "dkim" | "dmarc">> {
  const host = domain.hostname.trim().toLowerCase();
  const spfTxt = await txtAt(host);
  const dmarcTxt = await txtAt(`_dmarc.${host}`);
  const selector = domain.dkimSelector.trim() || "default";
  const dkimTxt = await txtAt(`${selector}._domainkey.${host}`);

  const spf: DnsStatus = spfTxt.some((t) => /v=spf1/i.test(t)) ? "pass" : "fail";
  const dmarc: DnsStatus = dmarcTxt.some((t) => /v=dmarc1/i.test(t)) ? "pass" : "fail";
  const dkim: DnsStatus = dkimTxt.some((t) => /v=dkim1/i.test(t) || /p=/i.test(t)) ? "pass" : "fail";

  return { spf, dkim, dmarc };
}
