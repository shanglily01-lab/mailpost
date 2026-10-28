"use client";

import { ClipboardEvent, useEffect, useRef } from "react";
import { bodyToEditorHtml, htmlToPlainWithLinks, tidyPastedText } from "@/lib/paste-links";

export function MailBodyField({
  value,
  onChange,
  className = "min-h-56",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    const current = tidyPastedText(htmlToPlainWithLinks(el.innerHTML));
    if (current === value) return;
    el.innerHTML = bodyToEditorHtml(value);
  }, [value]);

  function read(): string {
    const el = ref.current;
    if (!el) return "";
    return htmlToPlainWithLinks(el.innerHTML);
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const source = html && /<a\b/i.test(html) ? htmlToPlainWithLinks(html) : text;
    const cleaned = tidyPastedText(source);
    document.execCommand("insertHTML", false, bodyToEditorHtml(cleaned));
    onChange(read());
  }

  return (
    <div
      ref={ref}
      className={`field whitespace-pre-wrap ${className}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      suppressContentEditableWarning
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onChange(read());
      }}
      onInput={() => onChange(read())}
      onPaste={onPaste}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
    />
  );
}
