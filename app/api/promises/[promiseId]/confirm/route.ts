import { NextResponse } from "next/server";

import { withCaller } from "@/lib/api-guard";
import { setPlanConfirmed } from "@/lib/promise-service";

// 플랜 확정 — 만든 사람만.
//
// POST가 확정, DELETE가 되돌리기다. 되돌리기를 남겨둔 것이 이 기능의 핵심이라
// 별도 라우트로 뺐다. 장소 변경(PATCH /place)에 얹지 않은 이유는, 확정은
// 장소만이 아니라 "날짜와 장소를 합쳐 이제 결정됐다"는 별개의 선언이기 때문이다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

/** 확정한다. 날짜나 장소가 비어 있으면 무엇이 없는지 알려주며 거절한다. */
export const POST = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  const result = await setPlanConfirmed(caller, promiseId, true);
  return NextResponse.json({ ok: true, ...result });
});

/** 다시 정하는 중으로 되돌린다. 날짜·장소는 지우지 않는다. */
export const DELETE = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  const result = await setPlanConfirmed(caller, promiseId, false);
  return NextResponse.json({ ok: true, ...result });
});
