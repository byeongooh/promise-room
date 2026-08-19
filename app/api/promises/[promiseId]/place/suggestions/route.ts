import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { addPlaceSuggestion, removePlaceSuggestion } from "@/lib/place-service";

// 장소 제안 — 올리기(POST)와 거두기(DELETE).
//
// 하위 컬렉션이 아니라 약속 문서 안 배열에 쌓인다. 하위 컬렉션이면 보안 규칙을
// 새로 짜서 콘솔에 배포해야 하는데(사람이 직접 해야 하는 일), 제안은 한 플랜에
// 몇 건 수준이라 문서에 실어도 무겁지 않다. favoritedBy와 같은 판단이다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const summarySchema = z.object({
  averageSec: z.number().finite(),
  maxSec: z.number().finite(),
  spreadSec: z.number().finite(),
  counted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

const suggestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).default(""),
  lat: z.number().finite(),
  lng: z.number().finite(),
  // 방금 계산한 요약을 같이 받는다. 목록을 열 때마다 다시 계산하면
  // 제안 수 × 참여자 수만큼 외부 API를 부르게 되어 감당이 안 된다.
  summary: summarySchema,
});

export const POST = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = suggestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "제안 내용이 올바르지 않습니다.");
  }

  const { summary, ...place } = parsed.data;
  const suggestion = await addPlaceSuggestion(caller, promiseId, place, summary);
  return NextResponse.json(suggestion);
});

export const DELETE = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw badRequest("어떤 제안인지 알 수 없습니다.");

  await removePlaceSuggestion(caller, promiseId, id);
  return NextResponse.json({ ok: true });
});
