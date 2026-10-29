"use client";

import { FormEvent, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead, Stamp } from "@/components/ui";

export default function MailboxesPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [form, setForm] = useState({ email: "", displayName: "", smtpPass: "" });
  const [passEdit, setPassEdit] = useState<Record<string, string>>({});

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("createMailbox", form);
    if (r.ok) setForm({ email: "", displayName: "", smtpPass: "" });
  }

  return (
    <>
      <PageHead
        kicker="04 / Gmail"
        title="接入发信 Gmail"
        desc="只走 Gmail SMTP。密码填 16 位应用专用密码，不是登录密码。新号前 3 天每天最多 5 封。"
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {state.mailboxes.length === 0 ? <div className="text-mist">还没有 Gmail。用右侧表单接入。</div> : null}
          {state.mailboxes.map((m) => (
            <article key={m.id} className="panel p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-serif text-xl">{m.displayName}</div>
                  <div className="num mt-1 text-sm text-mist">{m.email}</div>
                </div>
                <Stamp tone={m.status === "ready" ? "sage" : "amber"}>{m.status === "ready" ? "就绪" : `养号 D${m.warmupDay}`}</Stamp>
              </div>
              <div className="num text-[12px] text-mist">
                今日 {m.sentToday}/{m.effectiveCap} · smtp.gmail.com:587
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className="field min-w-0 flex-1"
                  type="password"
                  placeholder="更新应用专用密码"
                  value={passEdit[m.id] ?? ""}
                  onChange={(e) => setPassEdit({ ...passEdit, [m.id]: e.target.value })}
                />
                <button
                  className="btn"
                  disabled={busy || !passEdit[m.id]}
                  type="button"
                  onClick={async () => {
                    const r = await mutate("updateMailbox", { id: m.id, smtpPass: passEdit[m.id] });
                    if (r.ok) setPassEdit({ ...passEdit, [m.id]: "" });
                  }}
                >
                  更新
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    if (!confirm(`删除发件邮箱 ${m.email}？排队中用这个号发的信也会取消。`)) return;
                    mutate("deleteMailbox", { id: m.id });
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>

        <form className="panel p-5 space-y-3" onSubmit={onAdd}>
          <h2 className="font-serif text-xl">接入 Gmail</h2>
          <Field label="Gmail 地址">
            <input className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@gmail.com" required />
          </Field>
          <Field label="显示名">
            <input className="field" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="应用专用密码">
            <input className="field" type="password" value={form.smtpPass} onChange={(e) => setForm({ ...form, smtpPass: e.target.value })} required />
          </Field>
          <button className="btn btn-amber w-full" disabled={busy} type="submit">
            {busy ? "正在验证 SMTP…" : "接入"}
          </button>
          <p className="text-[12px] text-mist">每个 Gmail 都要单独生成应用专用密码。接入时会先连 smtp.gmail.com 试登录。</p>
        </form>
      </div>
    </>
  );
}
