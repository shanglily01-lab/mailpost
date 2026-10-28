function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeHref(raw: string): string {
  const href = decodeEntities(raw).trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^www\./i.test(href)) return `https://${href}`;
  return "";
}

/** Word puts the address on the link, not in the visible text. Keep both. */
export function htmlToPlainWithLinks(html: string): string {
  const withoutNotes = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const linked = withoutNotes.replace(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi, (_all, hrefA: string, hrefB: string, inner: string) => {
    const url = normalizeHref(hrefA || hrefB || "");
    const label = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!url) return label;
    if (!label || label.replace(/\s/g, "") === url) return url;
    return `[${label.replace(/[\[\]]/g, "")}](${url})`;
  });
  const text = linked
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    ;
  return decodeEntities(text).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function pastedBody(data: DataTransfer, current: string, start: number, end: number): string | null {
  const html = data.getData("text/html");
  if (!html || !/<a\b/i.test(html)) return null;
  const plain = htmlToPlainWithLinks(html);
  if (!/https?:\/\//i.test(plain)) return null;
  return current.slice(0, start) + plain + current.slice(end);
}
