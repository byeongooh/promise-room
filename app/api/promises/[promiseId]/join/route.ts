import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { joinPromise } from "@/lib/promise-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const joinSchema = z.object({
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

export const POST = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = joinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  await joinPromise(caller, promiseId, parsed.data.password);
  return NextResponse.json({ ok: true });
});
