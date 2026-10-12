import { NextResponse } from "next/server";
import { mutateState } from "@/lib/store";
import { unsubscribeByToken } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = String(body.token ?? "");
  const result = await mutateState((state) => unsubscribeByToken(state, token));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
