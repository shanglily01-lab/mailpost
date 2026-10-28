"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";
import type { SequenceStep } from "@/lib/types";

const blank: SequenceStep[] = [{ delayDays: 0, subject: "", body: "" }];

export default function SequencesPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>(blank);

  const selected = useMemo(() => state?.sequences.find((s) => s.id === id), [state, id]);

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setSteps(selected.steps);
    }
  }, [selected]);

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  function patch(i: number, p: Partial<SequenceStep>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...p } : step)));
  }

  function startNew() {
    setId("");
    setName("");
    setSteps(blank);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("saveSequence", { id: id || undefined, name, steps });
    const data = r.data as { id?: string } | undefined;
    if (r.ok && data?.id) setId(data.id);
  }

  async function onDelete() {
    if (!id) return;
    const r = await mutate("deleteSequence", { id });
    if (r.ok) startNew();
  }

  return (
    <>
      <PageHead
        kicker="05 / 话术"
        title="自己写，随时改"
        desc="标题和正文都是你的。可用 {{firstName}} {{company}}，网址会变成可点击的按钮。写信时会按联系人替换。保存后立刻生效。"
        actions={
          <button className="btn" type="button" onClick={startNew}>
            新建
          </button>
        }
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[220px_1fr]">
        <aside className="panel p-2">
          {state.sequences.length === 0 ? <div className="px-3 py-4 text-sm text-mist">还没有话术。</div> : null}
          {state.sequences.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setId(s.id)}
              className={`w-full text-left px-3 py-2 ${s.id === id ? "bg-ink-3" : "text-mist"}`}
            >
              {s.name}
              <div className="num text-[11px]">{s.steps.length} 封</div>
            </button>
          ))}
        </aside>

        <form className="space-y-4" onSubmit={onSave}>
          <Field label="话术名称">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：第一次问候" />
          </Field>
          {steps.map((step, i) => (
            <div key={i} className="panel p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-serif text-lg">第 {i + 1} 封</div>
                {steps.length > 1 ? (
                  <button className="btn" type="button" onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}>
                    删这封
                  </button>
                ) : null}
              </div>
              <Field label="标题">
                <input className="field" value={step.subject} onChange={(e) => patch(i, { subject: e.target.value })} />
              </Field>
              <Field label="正文">
                <textarea className="field min-h-40" value={step.body} onChange={(e) => patch(i, { body: e.target.value })} />
              </Field>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={() => setSteps((s) => [...s, { delayDays: 0, subject: "", body: "" }])}>
              加一封
            </button>
            <button className="btn btn-amber" disabled={busy} type="submit">
              保存
            </button>
            {id ? (
              <button className="btn" disabled={busy} type="button" onClick={onDelete}>
                删除此话术
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </>
  );
}
