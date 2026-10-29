"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead } from "@/components/ui";

export default function CompliancePage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [form, setForm] = useState({
    companyName: "",
    physicalAddress: "",
    publicBaseUrl: "",
  });

  useEffect(() => {
    if (!state) return;
    setForm({
      companyName: state.settings.companyName,
      physicalAddress: state.settings.physicalAddress,
      publicBaseUrl: state.settings.publicBaseUrl,
    });
  }, [state]);

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await mutate("updateSettings", form);
  }

  return (
    <>
      <PageHead kicker="08 / 设置" title="签名和退订" desc="显示名会作为私人信签名。正文里的网址会变成可点击的按钮。退订地址只放在邮件头里，不会写进正文。" />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <form className="max-w-xl p-6 space-y-3" onSubmit={onSave}>
        <Field label="显示名称">
          <input className="field" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </Field>
        <Field label="地址（可选）">
          <textarea className="field min-h-20" value={form.physicalAddress} onChange={(e) => setForm({ ...form, physicalAddress: e.target.value })} />
        </Field>
        <Field label="站点（群发退订，需 https 域名）">
          <input
            className="field"
            value={form.publicBaseUrl}
            onChange={(e) => setForm({ ...form, publicBaseUrl: e.target.value })}
            placeholder="https://mail.yourdomain.com"
          />
        </Field>
        <button className="btn btn-amber" disabled={busy} type="submit">
          保存
        </button>
      </form>
    </>
  );
}
