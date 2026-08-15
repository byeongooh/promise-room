import { NextResponse } from "next/server";

import { withCaller } from "@/lib/api-guard";
import { deletePromise } from "@/lib/promise-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

export const DELETE = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  await deletePromise(caller, promiseId);
  return NextResponse.json({ ok: true });
});
