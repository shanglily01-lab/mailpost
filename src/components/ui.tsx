"use client";

import type { ReactNode } from "react";

export function PageHead({
  kicker,
  title,
  desc,
  actions,
}: {
  kicker: string;
  title: string;
  desc: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 py-6">
      <div>
        <div className="num text-[11px] tracking-[0.18em] text-mist">{kicker}</div>
        <h1 className="mt-1 font-serif text-3xl text-paper">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mist">{desc}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Banner({
  kind,
  children,
}: {
  kind: "warn" | "danger" | "ok" | "info";
  children: ReactNode;
}) {
  const color =
    kind === "danger" ? "text-rust border-rust" : kind === "ok" ? "text-sage border-sage" : kind === "warn" ? "text-amber border-amber" : "text-mist border-line";
  return <div className={`mx-6 mt-5 border px-4 py-3 text-sm leading-6 ${color}`}>{children}</div>;
}

export function Stamp({
  tone,
  children,
}: {
  tone: "sage" | "amber" | "rust" | "mist" | "paper";
  children: ReactNode;
}) {
  const map = {
    sage: "text-sage",
    amber: "text-amber",
    rust: "text-rust",
    mist: "text-mist",
    paper: "text-paper",
  };
  return <span className={`stamp ${map[tone]}`}>{children}</span>;
}

export function Meter({
  label,
  value,
  max,
  redline,
  format,
}: {
  label: string;
  value: number;
  max: number;
  redline: number;
  format: (n: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const red = Math.max(0, Math.min(100, (redline / max) * 100));
  const over = value >= redline;
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[12px] text-mist">{label}</div>
        <div className={`num text-lg ${over ? "text-rust" : "text-paper"}`}>{format(value)}</div>
      </div>
      <div className="relative mt-3 h-1.5 bg-ink-3">
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-rust" : "bg-sage"}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-[-3px] h-3 w-px bg-rust" style={{ left: `${red}%` }} />
      </div>
      <div className="mt-2 flex justify-between num text-[10px] text-mist">
        <span>当前 {format(value)}</span>
        <span>红线 {format(redline)}</span>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] tracking-[0.08em] text-mist uppercase">{label}</div>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-16 text-center text-mist">{children}</div>;
}
