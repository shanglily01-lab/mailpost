"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead, Stamp } from "@/components/ui";
import { BULK_BATCH_SIZE } from "@/lib/constants";
import { containsHyperlink, HYPERLINK_ERROR } from "@/lib/template";

const statusTone = {
  draft: "mist",
  running: "amber",
  paused: "mist",
  completed: "sage",
  killed: "rust",
} as const;

const statusLabel = {
  draft: "草稿",
  running: "发送中",
  paused: "已暂停",
  completed: "已完成",
  killed: "已熔断",
} as const;

function pickIds(ids: string[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const id of ids.slice(0, BULK_BATCH_SIZE)) next[id] = true;
  return next;
}

export default function BlastPage() {
  const { state, error, notice, busy, mutate, refresh, setError } = useMailpost();
  const live = useMemo(() => state?.mailboxes ?? [], [state]);
  const [mailboxId, setMailboxId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scriptId, setScriptId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (live.some((m) => m.id === mailboxId)) return;
    setMailboxId(live[0]?.id ?? "");
  }, [live, mailboxId]);

  const running = Boolean(state?.campaigns.some((c) => c.status === "running"));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      refresh().catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const sentEmails = useMemo(() => {
    const byId = new Map((state?.contacts ?? []).map((c) => [c.id, c.email.toLowerCase()]));
    const emails = new Set<string>();
    for (const job of state?.jobs ?? []) {
      if (job.status !== "sent" && job.status !== "bounced" && job.status !== "replied") continue;
      const email = (job.toEmail || byId.get(job.contactId) || "").toLowerCase();
      if (email) emails.add(email);
    }
    return emails;
  }, [state]);
  const queuedEmails = useMemo(() => {
    const byId = new Map((state?.contacts ?? []).map((c) => [c.id, c.email.toLowerCase()]));
    const emails = new Set<string>();
    for (const job of state?.jobs ?? []) {
      if (job.status !== "queued") continue;
      const email = (job.toEmail || byId.get(job.contactId) || "").toLowerCase();
      if (email) emails.add(email);
    }
    for (const campaign of state?.campaigns ?? []) {
      if (campaign.status !== "running" && campaign.status !== "paused") continue;
      if (campaign.kind !== "bulk" && !(campaign.subject && !campaign.sequenceId)) continue;
      for (const id of campaign.contactIds) {
        const email = byId.get(id);
        if (email) emails.add(email);
      }
    }
    return emails;
  }, [state]);
  const eligible = useMemo(
    () =>
      (state?.contacts ?? []).filter(
        (c) =>
          !c.unsubscribed &&
          !c.suppressed &&
          c.source !== "purchased" &&
          !sentEmails.has(c.email.toLowerCase()) &&
          !queuedEmails.has(c.email.toLowerCase()),
      ),
    [state, sentEmails, queuedEmails],
  );
  const ids = eligible.filter((c) => selected[c.id]).map((c) => c.id);

  useEffect(() => {
    if (seeded || eligible.length === 0) return;
    setSeeded(true);
    setSelected(pickIds(eligible.map((c) => c.id)));
  }, [seeded, eligible]);

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  const box = state.mailboxes.find((m) => m.id === mailboxId);
  const left = box ? Math.max(0, box.effectiveCap - box.sentToday) : 0;
  const todaySend = Math.min(BULK_BATCH_SIZE, eligible.length, left);
  const later = Math.max(0, eligible.length - todaySend);

  function pickTwenty() {
    setSelected(pickIds(eligible.map((c) => c.id)));
  }

  function applyScript(id: string) {
    setScriptId(id);
    const s = state!.sequences.find((x) => x.id === id);
    if (!s?.steps[0]) return;
    setSubject(s.steps[0].subject);
    setBody(s.steps[0].body);
    if (!name) setName(s.name);
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (containsHyperlink(subject) || containsHyperlink(body)) {
      setError(HYPERLINK_ERROR);
      return;
    }
    const r = await mutate("startBulk", { mailboxId, contactIds: eligible.map((c) => c.id), subject, body, name });
    if (r.ok) setSelected({});
  }

  const blasts = state.campaigns.filter((c) => c.kind === "bulk" || Boolean(c.subject)).slice().reverse();

  return (
    <>
      <PageHead
        kicker="02 / 群发"
        title="按顺序一批批发"
        desc="还没发过的人按名单顺序走，每批 20 个。这一批发完会自动接下一批。已经发过的不会再发。正文不能放网址。今天额度用完就停，第二天自动继续，约每 25 秒一封。"
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_340px]">
        <form className="space-y-4" onSubmit={onStart}>
          {live.length === 0 ? <Banner kind="warn">还没有 Gmail。先到「Gmail」页接入。</Banner> : null}
          {state.contacts.length === 0 ? <Banner kind="warn">还没有联系人。先到「联系人」页添加。</Banner> : null}

          <Field label="发件 Gmail">
            <select className="field" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)} required>
              {live.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.email} · 今日还能发 {Math.max(0, m.effectiveCap - m.sentToday)} 封
                </option>
              ))}
            </select>
          </Field>

          <Field label="套用话术">
            <select className="field" value={scriptId} onChange={(e) => applyScript(e.target.value)}>
              <option value="">不套用，自己写</option>
              {state.sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="任务名称（可选）">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 4 月跟进" />
          </Field>

          <Field label="标题">
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </Field>
          <Field label="正文">
            <textarea className="field min-h-48" value={body} onChange={(e) => setBody(e.target.value)} required />
          </Field>
          <p className="text-[12px] text-mist">可用变量：{"{{firstName}}"} {"{{company}}"} {"{{lastName}}"}。不要写网址或超链接。</p>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-amber" disabled={busy || live.length === 0 || eligible.length === 0} type="submit">
              {busy ? "排队中…" : `开始群发（${eligible.length} 人，每批 ${BULK_BATCH_SIZE}）`}
            </button>
            <span className="num text-sm text-mist">
              {box ? `本批最多 ${todaySend} · 之后还有 ${later} · 今日额度 ${left}/${box.effectiveCap}` : ""}
            </span>
          </div>
        </form>

        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl">收件人</h2>
            <div className="flex gap-2">
              <button className="btn" type="button" onClick={pickTwenty}>
                选 20 个
              </button>
              <button className="btn" type="button" onClick={() => setSelected({})}>
                清空
              </button>
            </div>
          </div>
          <p className="mt-1 text-[12px] text-mist">
            已发过 {sentEmails.size} 个。点开始后整份未发送名单都会排队，每批 {BULK_BATCH_SIZE} 个，发完自动继续。
          </p>
          <ul className="mt-3 max-h-[28rem] space-y-1 overflow-auto">
            {eligible.length === 0 ? <li className="text-sm text-mist">没有可发的联系人。</li> : null}
            {eligible.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 px-1 py-1.5 hover:bg-ink-3">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[c.id])}
                    onChange={(e) => {
                      if (e.target.checked && ids.length >= BULK_BATCH_SIZE) {
                        setError(`一次最多发 ${BULK_BATCH_SIZE} 个邮箱。`);
                        return;
                      }
                      setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }));
                    }}
                  />
                  <span>
                    <span className="block text-paper">{c.firstName || c.email}</span>
                    <span className="num block text-[12px] text-mist">{c.email}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line p-6">
        <h2 className="font-serif text-xl">进行中的群发</h2>
        {blasts.length === 0 ? <p className="mt-3 text-sm text-mist">还没有群发任务。</p> : null}
        <div className="mt-4 space-y-3">
          {blasts.map((c) => {
            const jobs = state.jobs.filter((j) => j.campaignId === c.id);
            const queued = jobs.filter((j) => j.status === "queued").length;
            const sent = jobs.filter((j) => j.status === "sent").length;
            const failed = jobs.filter((j) => j.status === "blocked" || j.status === "skipped").length;
            return (
              <div key={c.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Stamp tone={statusTone[c.status]}>{statusLabel[c.status]}</Stamp>
                      <span className="text-paper">{c.name}</span>
                    </div>
                    <p className="mt-2 num text-[12px] text-mist">
                      已发 {sent} · 排队 {queued} · 失败/跳过 {failed} · 共 {jobs.length}
                    </p>
                    {c.killReason ? <p className="mt-1 text-sm text-rust">{c.killReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.status === "running" ? (
                      <button className="btn" disabled={busy} onClick={() => mutate("pauseCampaign", { id: c.id })}>
                        暂停
                      </button>
                    ) : null}
                    {c.status === "paused" && queued > 0 ? (
                      <button className="btn" disabled={busy} onClick={() => mutate("pauseCampaign", { id: c.id, resume: true })}>
                        继续
                      </button>
                    ) : null}
                    {queued > 0 && (c.status === "running" || c.status === "paused") ? (
                      <button className="btn" disabled={busy} onClick={() => mutate("cancelBlast", { id: c.id })}>
                        取消剩余
                      </button>
                    ) : null}
                    {c.status === "running" && queued > 0 ? (
                      <button className="btn" disabled={busy} onClick={() => mutate("processQueue", { limit: 1 })}>
                        立刻发下一封
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
