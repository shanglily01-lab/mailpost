"use client";

import { FormEvent, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead, Stamp } from "@/components/ui";
import { contactSendable } from "@/lib/safety";

const statusTone = {
  draft: "mist",
  running: "sage",
  paused: "amber",
  completed: "paper",
  killed: "rust",
} as const;

export default function CampaignsPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [name, setName] = useState("新外投");
  const [sequenceId, setSequenceId] = useState("");
  const [mailboxIds, setMailboxIds] = useState<string[]>([]);
  const [onlySendable, setOnlySendable] = useState(true);
  const [preflight, setPreflight] = useState<{ blockers: string[]; warnings: string[]; sendableCount: number; total: number } | null>(
    null,
  );

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  const sendable = state.contacts.filter((c) => contactSendable(c, state.settings.legalRegion).length === 0);
  const audience = onlySendable ? sendable : state.contacts;
  const queued = state.jobs.filter((j) => j.status === "queued").length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await mutate("createCampaign", {
      name,
      sequenceId: sequenceId || state!.sequences[0]?.id,
      mailboxIds,
      contactIds: audience.map((c) => c.id),
    });
  }

  async function runPreflight(id: string) {
    const r = await mutate("preflightCampaign", { id });
    if (r.data && typeof r.data === "object") setPreflight(r.data as never);
  }

  return (
    <>
      <PageHead
        kicker="06 / 外投活动"
        title="微量、轮转、可熔断"
        desc="活动按邮箱日限额排队，不会一天打出几千封。启动前预检 DNS、养号额度、验真、同意与话术。退信或投诉越线即杀停。"
        actions={
          <button className="btn btn-amber" disabled={busy || queued === 0} onClick={() => mutate("processQueue", { limit: 8 })}>
            处理队列 · {queued}
          </button>
        }
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {state.campaigns.map((c) => (
            <article key={c.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-serif text-xl">{c.name}</div>
                  <div className="mt-1 text-[12px] text-mist">
                    {state.sequences.find((s) => s.id === c.sequenceId)?.name} · {c.contactIds.length} 人 ·{" "}
                    {c.mailboxIds.length} 个邮箱
                  </div>
                  {c.killReason ? <div className="mt-2 text-sm text-rust">{c.killReason}</div> : null}
                </div>
                <Stamp tone={statusTone[c.status]}>{c.status}</Stamp>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.status === "draft" ? (
                  <>
                    <button className="btn" disabled={busy} onClick={() => runPreflight(c.id)}>
                      预检
                    </button>
                    <button className="btn btn-amber" disabled={busy} onClick={() => mutate("launchCampaign", { id: c.id })}>
                      启动排队
                    </button>
                  </>
                ) : null}
                {c.status === "running" ? (
                  <button className="btn" disabled={busy} onClick={() => mutate("pauseCampaign", { id: c.id })}>
                    暂停
                  </button>
                ) : null}
                {c.status === "paused" ? (
                  <button className="btn" disabled={busy} onClick={() => mutate("pauseCampaign", { id: c.id, resume: true })}>
                    恢复
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {preflight ? (
            <div className="panel p-5">
              <h3 className="font-serif text-lg">预检结果</h3>
              <p className="mt-1 text-sm text-mist">
                可触达 {preflight.sendableCount}/{preflight.total}
              </p>
              {preflight.blockers.map((b) => (
                <p key={b} className="mt-2 text-sm text-rust">
                  {b}
                </p>
              ))}
              {preflight.warnings.map((b) => (
                <p key={b} className="mt-2 text-sm text-amber">
                  {b}
                </p>
              ))}
              {preflight.blockers.length === 0 ? <p className="mt-2 text-sm text-sage">可以启动。</p> : null}
            </div>
          ) : null}
        </div>

        <form className="panel p-5 space-y-3" onSubmit={onCreate}>
          <h2 className="font-serif text-xl">新建活动</h2>
          <Field label="名称">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="序列">
            <select className="field" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
              {state.sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="发信邮箱（可多选）">
            <div className="space-y-1">
              {state.mailboxes.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mailboxIds.includes(m.id)}
                    onChange={(e) =>
                      setMailboxIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id)))
                    }
                  />
                  <span className="num">
                    {m.email} · 今日 {m.sentToday}/{m.effectiveCap}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlySendable} onChange={(e) => setOnlySendable(e.target.checked)} />
            只纳入可发送联系人（{sendable.length} 人）
          </label>
          <button className="btn btn-amber w-full" disabled={busy} type="submit">
            保存草稿
          </button>
        </form>
      </div>
    </>
  );
}
