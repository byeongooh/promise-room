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

  // 이름을 비워둘 수 있게 푼 이유: 온라인 플랜에서 링크를 지우면 서비스
  // 이름도 같이 빈다. 오프라인 플랜의 "이름 없는 장소"는 place-service가
  // 그대로 막는다 — 검사를 없앤 게 아니라 온라인 경로만 통과시킨 것이다.
  const parsed = placeSchema
    .extend({
      name: z.string().trim().max(120).default(""),
      placeId: z.string().nullable().optional(),
      // 온라인 플랜은 좌표 대신 링크를 바꾼다.
      meetingUrl: z.string().trim().max(500).nullable().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "장소 정보가 올바르지 않습니다.");
  }

  const result = await changePlace(caller, promiseId, parsed.data);
  return NextResponse.json(result);
});
