import { NextResponse } from "next/server";
import { mutateState } from "@/lib/store";
import * as actions from "@/lib/actions";
import { ensureTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { action: string; payload?: Record<string, unknown> };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "无效请求" }, { status: 400 });
  }

  try {
    await ensureTicker();
    const payload = await mutateState(async (state) => {
      const p = body.payload ?? {};
      switch (body.action) {
        case "createDomain":
          return actions.createDomain(state, {
            hostname: String(p.hostname ?? ""),
            purpose: p.purpose === "primary" ? "primary" : "sending",
            dkimSelector: String(p.dkimSelector ?? "mail"),
          });
        case "checkDns":
          return actions.checkDns(state, String(p.id ?? ""));
        case "createMailbox":
          return actions.createMailbox(state, {
            email: String(p.email ?? ""),
            displayName: String(p.displayName ?? ""),
            smtpPass: String(p.smtpPass ?? ""),
          });
        case "updateMailbox":
          return actions.updateMailbox(state, {
            id: String(p.id ?? ""),
            displayName: p.displayName ? String(p.displayName) : undefined,
            smtpPass: p.smtpPass ? String(p.smtpPass) : undefined,
          });
        case "deleteMailbox":
          return actions.deleteMailbox(state, String(p.id ?? ""));
        case "deleteContact":
          return actions.deleteContact(state, String(p.id ?? ""));
        case "deleteSequence":
          return actions.deleteSequence(state, String(p.id ?? ""));
        case "saveTemplate":
          return actions.saveTemplate(state, {
            id: p.id ? String(p.id) : undefined,
            name: String(p.name ?? ""),
            subject: String(p.subject ?? ""),
            body: String(p.body ?? ""),
          });
        case "deleteTemplate":
          return actions.deleteTemplate(state, String(p.id ?? ""));
        case "startAuto":
          return actions.startAuto(state, {
            templateId: String(p.templateId ?? ""),
            mailboxIds: Array.isArray(p.mailboxIds) ? (p.mailboxIds as string[]) : [],
            contactIds: Array.isArray(p.contactIds) ? (p.contactIds as string[]) : [],
          });
        case "createContact":
          return actions.createContact(state, {
            email: String(p.email ?? ""),
            firstName: String(p.firstName ?? ""),
            lastName: String(p.lastName ?? ""),
            title: String(p.title ?? ""),
            company: String(p.company ?? ""),
            industry: String(p.industry ?? ""),
            icpFit: p.icpFit as never,
            source: p.source as never,
            consent: p.consent as never,
            region: p.region as never,
            notes: String(p.notes ?? ""),
          });
        case "importContacts":
          return actions.importContacts(state, {
            csv: String(p.csv ?? ""),
            source: p.source as never,
            defaultRegion: (p.defaultRegion as never) || "US",
          });
        case "verifyContacts":
          return actions.verifyContacts(state, Array.isArray(p.ids) ? (p.ids as string[]) : undefined);
        case "saveSequence":
          return actions.saveSequence(state, {
            id: p.id ? String(p.id) : undefined,
            name: String(p.name ?? ""),
            steps: (p.steps as never) || [],
          });
        case "createCampaign":
          return actions.createCampaign(state, {
            name: String(p.name ?? ""),
            sequenceId: String(p.sequenceId ?? ""),
            mailboxIds: (p.mailboxIds as string[]) || [],
            contactIds: (p.contactIds as string[]) || [],
          });
        case "preflightCampaign":
          return actions.preflightCampaign(state, String(p.id ?? ""));
        case "launchCampaign":
          return actions.launchCampaign(state, String(p.id ?? ""));
        case "pauseCampaign":
          return actions.pauseCampaign(state, String(p.id ?? ""), Boolean(p.resume));
        case "cancelBlast":
          return actions.cancelBlast(state, String(p.id ?? ""));
        case "startBulk":
          return actions.startBulk(state, {
            mailboxId: String(p.mailboxId ?? ""),
            contactIds: Array.isArray(p.contactIds) ? (p.contactIds as string[]) : [],
            subject: String(p.subject ?? ""),
            body: String(p.body ?? ""),
            name: p.name ? String(p.name) : undefined,
          });
        case "processQueue":
          return actions.processQueue(state, Number(p.limit ?? 1));
        case "sendOnce":
          return actions.sendOnce(state, {
            mailboxId: String(p.mailboxId ?? ""),
            to: String(p.to ?? ""),
            firstName: String(p.firstName ?? ""),
            subject: String(p.subject ?? ""),
            body: String(p.body ?? ""),
          });
        case "updateSettings":
          return actions.updateSettings(state, p);
        case "markJob":
          return actions.markJob(state, {
            jobId: String(p.jobId ?? ""),
            status: p.status as never,
            bounceType: p.bounceType as never,
          });
        case "reportSpam":
          return actions.reportSpam(state);
        default:
          return { ok: false, error: `未知操作 ${body.action}` };
      }
    });

    await ensureTicker();
    return NextResponse.json(payload, { status: payload.ok ? 200 : 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
