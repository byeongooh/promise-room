import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { changePlace, checkPlace } from "@/lib/place-service";

// 약속 장소 — 계산해보기(POST)와 실제로 바꾸기(PATCH).
//
// 둘을 같은 경로에 둔 이유: 대상이 같은 "이 플랜의 장소"이고 권한만 다르다.
// POST는 참여자 누구나(계산은 아무것도 바꾸지 않는다), PATCH는 만든 사람만.
// 권한 판단은 place-service가 한다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const placeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).default(""),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

/** 후보 장소 계산 — 참여자 전원의 이동시간을 재서 돌려준다. 저장하지 않는다. */
export const POST = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = placeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "장소 정보가 올바르지 않습니다.");
  }

  const result = await checkPlace(caller, promiseId, parsed.data);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});

/** 장소 변경 — 만든 사람만. 참여자들의 출발 시각도 다시 계산된다. */
export const PATCH = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = placeSchema
    .extend({ placeId: z.string().nullable().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "장소 정보가 올바르지 않습니다.");
  }

  const result = await changePlace(caller, promiseId, parsed.data);
  return NextResponse.json(result);
});
