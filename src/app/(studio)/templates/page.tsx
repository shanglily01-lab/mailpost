"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MailBodyField } from "@/components/MailBodyField";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";

export default function TemplatesPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const templates = state?.templates ?? [];
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const selected = useMemo(() => templates.find((item) => item.id === id), [templates, id]);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setSubject(selected.subject);
    setBody(selected.body);
  }, [selected]);

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  function startNew() {
    setId("");
    setName("");
    setSubject("");
    setBody("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("saveTemplate", { id: id || undefined, name, subject, body });
    const data = r.data as { id?: string } | undefined;
    if (r.ok && data?.id) setId(data.id);
  }

  async function onDelete() {
    if (!id) return;
    const r = await mutate("deleteTemplate", { id });
    if (r.ok) startNew();
  }

  return (
    <>
      <PageHead
        kicker="03 / 模板"
        title="邮件模板"
        desc="每份模板是一封信：名称、标题、正文。群发里点「自动发」，选一份模板，还没发过的邮箱每人一封。网址和从 Word 粘贴的链接会变成可点击的按钮。"
        actions={
          <button className="btn" type="button" onClick={startNew}>
            新建
          </button>
        }
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[240px_1fr]">
        <aside className="panel p-2">
          {templates.length === 0 ? <div className="px-3 py-4 text-sm text-mist">还没有模板。</div> : null}
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setId(item.id)}
              className={`w-full text-left px-3 py-2 ${item.id === id ? "bg-ink-3" : "text-mist"}`}
            >
              {item.name}
              <div className="mt-0.5 truncate text-[12px] text-mist">{item.subject}</div>
            </button>
          ))}
        </aside>

        <form className="space-y-4" onSubmit={onSave}>
          <Field label="模板名称">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 ChainPoker 邀请" />
          </Field>
          <Field label="标题">
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </Field>
          <Field label="正文">
            <MailBodyField value={body} onChange={setBody} className="min-h-56" />
          </Field>
          <p className="text-[12px] text-mist">可用变量：{"{{firstName}}"} {"{{company}}"} {"{{lastName}}"}。保存后，到「群发」点自动发即可选用。</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-amber" disabled={busy} type="submit">
              保存
            </button>
            {id ? (
              <button className="btn" disabled={busy} type="button" onClick={onDelete}>
                删除此模板
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </>
  );
}
