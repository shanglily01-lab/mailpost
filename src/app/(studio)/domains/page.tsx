"use client";

import { FormEvent, useState } from "react";
import { useMailpost } from "@/lib/client";
import { Banner, Field, PageHead, Stamp } from "@/components/ui";

export default function DomainsPage() {
  const { state, error, notice, busy, mutate } = useMailpost();
  const [hostname, setHostname] = useState("");
  const [selector, setSelector] = useState("mail");

  if (!state) return <div className="p-10 text-mist">{error || "加载中…"}</div>;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const r = await mutate("createDomain", { hostname, purpose: "sending", dkimSelector: selector });
    if (r.ok) {
      setHostname("");
    }
  }

  return (
    <>
      <PageHead
        kicker="02 / 发信域名"
        title="与主站彻底隔离"
        desc="用 getyourcompany.com 这类备用域发冷邮件，不要动 northbound.cn 这种主业务域。先配 SPF、DKIM、DMARC，再养号。"
      />
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>域名</th>
                <th>角色</th>
                <th>SPF</th>
                <th>DKIM</th>
                <th>DMARC</th>
                <th>养号</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.domains.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="num">{d.hostname}</div>
                    <div className="mt-1 text-[12px] text-mist">{d.notes}</div>
                  </td>
                  <td>
                    <Stamp tone={d.purpose === "primary" ? "rust" : "sage"}>{d.purpose === "primary" ? "主域" : "发信"}</Stamp>
                  </td>
                  <td className="num">{d.spf}</td>
                  <td className="num">
                    {d.dkim}
                    <div className="text-[11px] text-mist">{d.dkimSelector}._domainkey</div>
                  </td>
                  <td className="num">{d.dmarc}</td>
                  <td className="num">D{d.warmupDay}</td>
                  <td>
                    {d.purpose === "sending" ? (
                      <button className="btn" disabled={busy} onClick={() => mutate("checkDns", { id: d.id })}>
                        查 DNS
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="panel p-5 space-y-4" onSubmit={onAdd}>
          <h2 className="font-serif text-xl">添加备用发信域</h2>
          <p className="text-sm leading-6 text-mist">
            若填写的是主域名 {state.settings.primaryDomain}，系统会自动锁定，禁止外投。
          </p>
          <Field label="Hostname">
            <input className="field" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="getnorthbound.com" required />
          </Field>
          <Field label="DKIM selector">
            <input className="field" value={selector} onChange={(e) => setSelector(e.target.value)} />
          </Field>
          <button className="btn btn-amber w-full" disabled={busy} type="submit">
            添加发信域
          </button>
          <pre className="text-[11px] leading-5 text-mist whitespace-pre-wrap">
            {`TXT  @  v=spf1 include:_spf.google.com ~all
TXT  mail._domainkey  v=DKIM1; k=rsa; p=...
TXT  _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@...`}
          </pre>
        </form>
      </div>
    </>
  );
}
