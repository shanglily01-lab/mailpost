"use client";

import { useMailpost } from "@/lib/client";
import { Banner, PageHead, Stamp } from "@/components/ui";

const jobTone = {
  queued: "mist",
  sent: "sage",
  bounced: "rust",
  replied: "amber",
  unsubscribed: "rust",
  skipped: "mist",
  blocked: "amber",
} as const;

export default function ActivityPage() {
  const { state, error, notice, mutate } = useMailpost();
  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  return (
    <>
      <PageHead kicker="05 / 已发送" title="发送记录" desc="这里只留下你实际发出去的信。" />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="p-6 space-y-6">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>时间</th>
                <th>状态</th>
                <th>标题</th>
                <th>原因</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.jobs
                .slice()
                .reverse()
                .map((j) => {
                  const contact = state.contacts.find((c) => c.id === j.contactId);
                  return (
                    <tr key={j.id}>
                      <td className="num text-[12px]">{(j.sentAt || j.scheduledAt).replace("T", " ").slice(0, 16)}</td>
                      <td>
                        <Stamp tone={jobTone[j.status]}>{j.status}</Stamp>
                      </td>
                      <td>
                        <div>{j.subject}</div>
                        <div className="num text-[12px] text-mist">{contact?.email}</div>
                      </td>
                      <td className="text-[12px] text-mist">{j.blockReason}</td>
                      <td>
                        {j.status === "sent" ? (
                          <div className="flex gap-1">
                            <button className="btn" onClick={() => mutate("markJob", { jobId: j.id, status: "bounced", bounceType: "hard" })}>
                              硬退
                            </button>
                            <button className="btn" onClick={() => mutate("markJob", { jobId: j.id, status: "replied" })}>
                              回复
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <div className="panel p-5">
          <h2 className="font-serif text-xl">系统事件</h2>
          <ul className="mt-3 space-y-2">
            {state.activity.map((a) => (
              <li key={a.id} className="border-t border-line pt-2">
                <div className="flex justify-between gap-3">
                  <span className={a.kind === "danger" ? "text-rust" : a.kind === "ok" ? "text-sage" : "text-paper"}>{a.title}</span>
                  <span className="num text-[11px] text-mist">{a.at.replace("T", " ").slice(0, 16)}</span>
                </div>
                <p className="text-sm text-mist">{a.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
