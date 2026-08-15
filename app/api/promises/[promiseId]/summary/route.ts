import { NextResponse } from "next/server";

import { withCaller } from "@/lib/api-guard";
import { getPromiseSummary } from "@/lib/promise-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

// 참여자가 아닌 사람에게 비밀번호 화면을 그려주기 위한 최소 정보.
// 참여자만 문서를 읽을 수 있게 되면 클라이언트가 직접 조회할 수 없기 때문에 필요하다.
// 제목과 만든 사람 이름만 내보낸다 — 날짜/장소/벌칙/참여자/비밀번호는 절대 포함하지 않는다.
export const GET = withCaller<Ctx>(async (caller, _req, ctx) => {
  const { promiseId } = await ctx.params;
  const summary = await getPromiseSummary(promiseId, caller);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
});
