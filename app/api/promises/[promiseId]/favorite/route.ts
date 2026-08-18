import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { setFavorite } from "@/lib/promise-service";

// 즐겨찾기 켜기/끄기. 대상은 항상 요청자 본인이라 uid를 받지 않는다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const favoriteSchema = z.object({ favorite: z.boolean() });

export const PATCH = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = favoriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  await setFavorite(caller, promiseId, parsed.data.favorite);
  return NextResponse.json({ ok: true });
});
