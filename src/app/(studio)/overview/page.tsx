"use client";

import Link from "next/link";
import { pct, useMailpost } from "@/lib/client";
import { Banner, Meter, PageHead, Stamp } from "@/components/ui";

export default function DashboardPage() {
  const { state, error, busy, notice, mutate } = useMailpost();
  if (!state) return <div className="p-10 text-mist">{error || "正在打开工作台…"}</div>;
  const o = state.overview;
  const queued = state.jobs.filter((j) => j.status === "queued").length;

  return (
    <>
      <PageHead
        kicker="02 / 总览"
        title="声誉驾驶舱"
        desc="退信红线 2%，投诉红线 0.1%。每个邮箱每天最多 50 封。要发信请回首页写信。"
        actions={
          <>
            <Link className="btn btn-amber" href="/">
              去写信
            </Link>
            <button className="btn" disabled={busy || queued === 0} onClick={() => mutate("processQueue", { limit: 8 })}>
              处理队列 · {queued}
            </button>
          </>
        }
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}
      {o.killActive ? <Banner kind="danger">熔断已触发：{o.killReasons.join(" ")}</Banner> : null}

      <section className="grid gap-3 p-6 md:grid-cols-2 xl:grid-cols-4">
        <Meter label="硬退信率" value={o.bounceRate} max={0.05} redline={state.settings.bounceKillThreshold} format={(n) => pct(n)} />
        <Meter label="垃圾投诉率" value={o.spamRate} max={0.003} redline={state.settings.spamKillThreshold} format={(n) => pct(n, 3)} />
        <Meter label="今日额度" value={o.sentToday} max={Math.max(o.dailyBudget, 1)} redline={o.dailyBudget} format={(n) => String(Math.round(n))} />
        <div className="panel p-4">
          <div className="text-[12px] text-mist">可触达联系人</div>
          <div className="mt-2 font-serif text-4xl">{o.sendableContacts}</div>
        </div>
      </section>

      <section className="grid gap-3 px-6 pb-10 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="font-serif text-xl">域名</h2>
          <ul className="mt-4 space-y-3">
            {state.domains.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <div className="num">{d.hostname}</div>
                <Stamp tone={d.purpose === "primary" ? "rust" : "sage"}>{d.purpose === "primary" ? "主域锁定" : "发信域"}</Stamp>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5">
          <h2 className="font-serif text-xl">邮箱</h2>
          <ul className="mt-4 space-y-3">
            {state.mailboxes.map((m) => (
              <li key={m.id} className="border-t border-line pt-3">
                <div className="num text-[13px]">{m.email}</div>
                <div className="mt-1 num text-[11px] text-mist">
                  今日 {m.sentToday}/{m.effectiveCap}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
