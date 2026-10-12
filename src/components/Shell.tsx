"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "写信", kicker: "01" },
  { href: "/blast", label: "群发", kicker: "02" },
  { href: "/mailboxes", label: "Gmail", kicker: "03" },
  { href: "/contacts", label: "联系人", kicker: "04" },
  { href: "/sequences", label: "话术", kicker: "05" },
  { href: "/activity", label: "已发送", kicker: "06" },
  { href: "/compliance", label: "设置", kicker: "07" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-full grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-line bg-ink-2">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="block">
            <div className="stamp text-amber">MailPost</div>
            <div className="mt-2 font-serif text-[22px] leading-none text-paper">邮 亭</div>
            <div className="mt-1 text-[11px] tracking-[0.16em] text-mist uppercase">Gmail outbound</div>
          </Link>
          <button className="btn lg:hidden" onClick={() => setOpen((v) => !v)} type="button">
            菜单
          </button>
        </div>
        <nav className={`${open ? "block" : "hidden"} lg:block px-3 pb-6`}>
          {NAV.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-baseline gap-3 px-3 py-2.5 rounded-[2px] ${
                  active ? "bg-ink-3 text-paper" : "text-mist hover:text-paper"
                }`}
              >
                <span className="num text-[10px] w-5">{item.kicker}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 min-h-screen bg-ink">{children}</div>
    </div>
  );
}
