import { NextResponse } from "next/server";

import { db } from "@/lib/firebaseAdmin";
import { withCaller } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 서버의 Firebase Admin 연결이 살아있는지 확인하는 점검용 엔드포인트.
// (환경변수가 빠지면 여기서 바로 드러난다)
// 인증 없이 열어두면 누구나 Admin SDK로 컬렉션을 건드리게 하는 셈이라 로그인 필수.
export const GET = withCaller(async () => {
  const snap = await db.collection("promises").limit(1).get();
  return NextResponse.json({ ok: true, size: snap.size });
});
