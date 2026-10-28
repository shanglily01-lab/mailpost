"use client";

import { FormEvent, useRef, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";

async function readImportFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let offset = 0;
  let encoding = "utf-8";
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
  }
  const slice = bytes.subarray(offset);
  if (encoding === "utf-8") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(slice);
    } catch {
      try {
        return new TextDecoder("gb18030").decode(slice);
      } catch {
        return new TextDecoder("utf-8").decode(slice);
      }
    }
  }
  return new TextDecoder(encoding).decode(slice);
}

export default function ContactsPage() {
  const { state, error, notice, busy, mutate, setError } = useMailpost();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", company: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function onImport(file?: File) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".txt")) {
      setError("只支持 CSV 或 TXT 文件。");
      return;
    }
    if (file.size === 0) {
      setError("文件是空的。");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("文件请控制在 1MB 以内。");
      return;
    }
    try {
      const csv = await readImportFile(file);
      await mutate("importContacts", { csv, source: "manual", defaultRegion: "US" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取文件");
    }
  }

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("createContact", form);
    if (r.ok) setForm({ email: "", firstName: "", lastName: "", company: "" });
  }

  return (
    <>
      <PageHead
        kicker="04 / 联系人"
        title="你自己加的名单"
        desc="可以单个添加，也可以一次导入 CSV 或 TXT。导入的名单另存在数据目录，更新代码不会清掉。写信可以单选，群发可以勾一批人。"
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="table-wrap">
          {state.contacts.length === 0 ? (
            <div className="p-8 text-mist">还没有联系人。右侧可以单个添加，或导入 CSV / TXT。</div>
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

        <div className="space-y-6">
          <div className="panel p-5 space-y-3">
            <h2 className="font-serif text-xl">导入</h2>
            <p className="text-sm leading-6 text-mist">
              选择 CSV 或 TXT。TXT 每行一个邮箱；CSV 表头写 email 或 邮箱，可带姓名、公司。选中后立即写入。
            </p>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onImport(file);
              }}
            />
            <button className="btn btn-amber w-full" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
              选择文件并导入
            </button>
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
      </div>
    </>
  );
}
