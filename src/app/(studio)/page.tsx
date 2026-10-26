"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";
import { containsHyperlink, HYPERLINK_ERROR } from "@/lib/template";

export default function ComposePage() {
  const { state, error, notice, busy, mutate, setError } = useMailpost();
  const live = useMemo(() => state?.mailboxes ?? [], [state]);
  const [mailboxId, setMailboxId] = useState("");
  const [contactId, setContactId] = useState("");
  const [to, setTo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [scriptName, setScriptName] = useState("");

  useEffect(() => {
    if (live.some((m) => m.id === mailboxId)) return;
    setMailboxId(live[0]?.id ?? "");
  }, [live, mailboxId]);

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;
  const data = state;

  const box = data.mailboxes.find((m) => m.id === mailboxId);
  const left = box ? Math.max(0, box.effectiveCap - box.sentToday) : 0;

  function pickContact(id: string) {
    setContactId(id);
    const c = data.contacts.find((x) => x.id === id);
    if (!c) return;
    setTo(c.email);
    setFirstName(c.firstName);
  }

  function applyScript(id: string) {
    setScriptId(id);
    const s = data.sequences.find((x) => x.id === id);
    if (!s?.steps[0]) return;
    setSubject(s.steps[0].subject);
    setBody(s.steps[0].body);
    setScriptName(s.name);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (containsHyperlink(subject) || containsHyperlink(body)) {
      setError(HYPERLINK_ERROR);
      return;
    }
    const r = await mutate("sendOnce", { mailboxId, to, firstName, subject, body });
    if (r.ok) {
      setTo("");
      setFirstName("");
      setContactId("");
    }
  }

  async function saveScript() {
    if (containsHyperlink(subject) || containsHyperlink(body)) {
      setError(HYPERLINK_ERROR);
      return;
    }
    const r = await mutate("saveSequence", {
      id: scriptId || undefined,
      name: scriptName.trim() || subject.slice(0, 24) || "未命名话术",
      steps: [{ delayDays: 0, subject, body }],
    });
    const data = r.data as { id?: string } | undefined;
    if (r.ok && data?.id) setScriptId(data.id);
  }

  return (
    <>
      <PageHead kicker="01 / 写信" title="用 Gmail 发一封" desc="选联系人或手填地址，可套用已保存的话术。正文不要放网址。要发给多人，到「群发」按每次 20 个排队。" />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <form className="max-w-3xl p-6 space-y-4" onSubmit={onSend}>
        {live.length === 0 ? <Banner kind="warn">还没有 Gmail。先到「Gmail」页接入。</Banner> : null}

        <Field label="发件 Gmail">
          <select className="field" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} required>
            {live.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email} · 今日还能发 {Math.max(0, m.effectiveCap - m.sentToday)} 封
              </option>
            ))}
          </select>
        </Field>

        <Field label="选用联系人（可选）">
          <select className="field" value={contactId} onChange={(e) => pickContact(e.target.value)}>
            <option value="">手填地址</option>
            {data.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName || c.email} · {c.email}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="发给谁">
            <input className="field" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <Field label="称呼">
            <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
        </div>

        <Field label="套用话术">
          <select className="field" value={scriptId} onChange={(e) => applyScript(e.target.value)}>
            <option value="">不套用，自己写</option>
            {data.sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="标题">
          <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </Field>
        <Field label="正文">
          <textarea className="field min-h-56" value={body} onChange={(e) => setBody(e.target.value)} required />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-amber" disabled={busy || live.length === 0 || !box || left <= 0} type="submit">
            {busy ? "发送中…" : "发送"}
          </button>
          <input
            className="field max-w-48"
            placeholder="话术名称"
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
          />
          <button className="btn" type="button" disabled={busy || !subject || !body} onClick={saveScript}>
            {scriptId ? "更新话术" : "存为话术"}
          </button>
          <Link className="btn" href="/blast">
            群发多人
          </Link>
          <span className="num text-sm text-mist">{box ? `今日剩余 ${left}/${box.effectiveCap}` : ""}</span>
        </div>
      </form>
    </>
  );
}
