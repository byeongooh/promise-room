import { NextResponse } from "next/server";

import { withCaller } from "@/lib/api-guard";
import { leavePromise } from "@/lib/promise-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

export const POST = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  await leavePromise(caller, promiseId);
  return NextResponse.json({ ok: true });
});
