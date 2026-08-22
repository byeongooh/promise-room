import { NextResponse } from "next/server";

import { withCaller } from "@/lib/api-guard";
import { getMyApple } from "@/lib/harvest-service";

// 내 사과 — 당도와 독사과.
//
// users/{uid}는 보안 규칙에서 열어주지 않아 클라이언트가 직접 못 읽는다.
// 메모(/api/notes)와 같은 판단이다 — 실시간일 이유가 없는 값은 서버로 돌리고
// `users/` 규칙을 새로 배포하지 않는다(사람이 직접 해야 하는 일이라서).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withCaller(async (caller) => {
  const apple = await getMyApple(caller);
  return NextResponse.json({ ok: true, apple });
});
