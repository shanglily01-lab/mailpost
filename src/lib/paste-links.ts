import { decodeHtmlEntities } from "./template";

function decodeEntities(text: string): string {
  return decodeHtmlEntities(text);
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

function emojiStart(line: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(line);
}

function joinWrapped(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (emojiStart(next)) return false;
  if (/^[—–-]/.test(next)) return true;
  if (/^[a-z]/.test(next)) return true;
  return false;
}

/** Word hard-wraps sentences and leaves emoji codes. Show the paragraph the way it was written. */
export function tidyPastedText(text: string): string {
  const lines = decodeHtmlEntities(text).replace(/\r\n/g, "\n").split("\n").map((line) => line.trim());
  const merged: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const prev = merged[merged.length - 1];
    if (prev && joinWrapped(prev, line)) merged[merged.length - 1] = `${prev} ${line}`;
    else merged.push(line);
  }
  return merged.join("\n");
}

function escapeEditor(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Editor shows the words. The address stays on the link, not in the text. */
export function bodyToEditorHtml(text: string): string {
  if (!text) return "";
  return text.split("\n").map((line) => {
    const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let html = "";
    let last = 0;
    for (const match of line.matchAll(re)) {
      const index = match.index ?? 0;
      html += escapeEditor(line.slice(last, index));
      html += `<a href="${escapeEditor(match[2])}" style="color:#f5c16c;font-weight:700;text-decoration:underline;">${escapeEditor(match[1])}</a>`;
      last = index + match[0].length;
    }
    html += escapeEditor(line.slice(last));
    return html || "<br>";
  }).join("<br>");
}

export function pastedBody(data: DataTransfer, current: string, start: number, end: number): string | null {
  const html = data.getData("text/html");
  if (!html || !/<a\b/i.test(html)) return null;
  const plain = htmlToPlainWithLinks(html);
  if (!/https?:\/\//i.test(plain)) return null;
  return current.slice(0, start) + plain + current.slice(end);
}
