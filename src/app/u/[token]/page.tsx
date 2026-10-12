"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function confirm() {
    const r = await fetch("/api/unsub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token }),
    });
    const data = (await r.json()) as { ok: boolean; error?: string; message?: string };
    if (data.ok) {
      setDone(true);
      setMsg(data.message || "已退订。");
    } else setMsg(data.error || "链接无效。");
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex items-center justify-center p-6">
      <div className="paper-sheet max-w-md w-full p-8">
        <div className="stamp text-[#7a4a12]">MailPost</div>
        <h1 className="mt-4 font-serif text-3xl">退订</h1>
        <p className="mt-3 text-sm leading-6 text-[#5c5144]">
          我们只会在你确认后停止发送。这是一键退订，符合 CAN-SPAM 与国内商业邮件规则。
        </p>
        {done ? (
          <p className="mt-6 text-sm">{msg}</p>
        ) : (
          <button className="btn btn-amber mt-6" onClick={confirm} type="button">
            确认退订
          </button>
        )}
        {msg && !done ? <p className="mt-4 text-sm text-rust">{msg}</p> : null}
      </div>
    </main>
  );
}
