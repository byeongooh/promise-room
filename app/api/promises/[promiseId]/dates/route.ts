import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import {
  addDateOption,
  confirmDate,
  removeDateOption,
  voteDateOption,
} from "@/lib/date-service";

// 날짜 맞추기 — 후보 올리기(POST) · 답하기(PATCH) · 확정(PUT) · 거두기(DELETE).
//
// 장소(/place)와 같은 모양이다. 후보를 올리고 답하는 건 참여자 누구나,
// 실제로 정하는 것만 만든 사람. 권한 판단은 date-service가 한다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다."),
  // 시간까지는 아직 안 정한 후보를 허용한다. "그날 언제든 되면 일단 그날부터"가
  // 실제 대화의 순서라서다. 확정할 때는 시간을 요구한다(date-service).
  time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
});

/** 날짜 후보 올리기. 올린 사람은 자동으로 "돼요"에 들어간다. */
export const POST = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = dateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "날짜가 올바르지 않습니다.");
  }

  const option = await addDateOption(caller, promiseId, parsed.data);
  return NextResponse.json(option);
});

/** 이 날짜에 올 수 있는지 답하기. */
export const PATCH = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = z
    .object({
      optionId: z.string().min(1),
      vote: z.enum(["ok", "maybe", "no"], {
        errorMap: () => ({ message: "답이 올바르지 않습니다." }),
      }),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  await voteDateOption(caller, promiseId, parsed.data.optionId, parsed.data.vote);
  return NextResponse.json({ ok: true });
});

/** 날짜 확정 — 만든 사람만. 참여자들의 출발 시각이 여기서 처음 생긴다. */
export const PUT = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식이 올바르지 않습니다."),
      time: z.string().regex(/^\d{2}:\d{2}$/, "시간까지 정해주세요."),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "날짜가 올바르지 않습니다.");
  }

  const result = await confirmDate(caller, promiseId, parsed.data);
  return NextResponse.json(result);
});

/** 후보 거두기. 올린 본인 또는 만든 사람. */
export const DELETE = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw badRequest("어떤 후보인지 알 수 없습니다.");

  await removeDateOption(caller, promiseId, id);
  return NextResponse.json({ ok: true });
});
