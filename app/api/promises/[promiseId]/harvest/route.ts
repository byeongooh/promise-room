import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { getHarvestState, submitHarvestBallot } from "@/lib/harvest-service";

// 수확 — 약속이 끝난 뒤 서로를 평가하고 정산한다.
//
// GET이 상태 조회이면서 **정산이 일어나는 자리**이기도 하다. 자동으로 도는
// 작업(cron)이 없어서, 전원이 표를 냈거나 기간이 지난 것을 알아챌 계기가
// "누군가 이 플랜을 열어봄"밖에 없다. 정산은 트랜잭션 안에서 한 번만
// 일어나므로 여럿이 동시에 열어도 당도가 두 번 깎이지 않는다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const BallotSchema = z.object({
  // uid → 표. 키가 uid라 record로 받는다.
  votes: z.record(z.string(), z.enum(["onTime", "late", "noShow"])),
});

/** 지금 상태. 정산할 때가 됐으면 여기서 정산까지 하고 결과를 돌려준다. */
export const GET = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  const state = await getHarvestState(caller, promiseId);
  return NextResponse.json({ ok: true, harvest: state });
});

/** 표를 낸다. 한 번 내면 못 바꾼다(harvest-service의 주석 참고). */
export const POST = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = BallotSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest("평가 내용을 읽지 못했습니다.");

  const state = await submitHarvestBallot(caller, promiseId, parsed.data.votes);
  return NextResponse.json({ ok: true, harvest: state });
});
