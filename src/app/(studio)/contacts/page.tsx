"use client";

import { FormEvent, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";

export default function ContactsPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", company: "" });

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("createContact", form);
    if (r.ok) setForm({ email: "", firstName: "", lastName: "", company: "" });
  }

  return (
    <>
      <PageHead kicker="03 / 联系人" title="你自己加的名单" desc="没有演示数据。在这里添加收件人，写信页可以直接选用。" />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="table-wrap">
          {state.contacts.length === 0 ? (
            <div className="p-8 text-mist">还没有联系人。</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>公司</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="num text-[13px]">{c.email}</td>
                    <td className="text-mist">{c.company}</td>
                    <td>
                      <button className="btn" disabled={busy} onClick={() => mutate("deleteContact", { id: c.id })}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className="panel p-5 space-y-3" onSubmit={onAdd}>
          <h2 className="font-serif text-xl">添加</h2>
          <Field label="邮箱">
            <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="名">
            <input className="field" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="姓">
            <input className="field" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
          <Field label="公司">
            <input className="field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <button className="btn btn-amber w-full" disabled={busy} type="submit">
            添加
          </button>
        </form>
      </div>
    </>
  );
}
