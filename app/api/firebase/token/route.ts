import { NextResponse } from "next/server";

import { admin } from "@/lib/firebaseAdmin";
import { getCaller, toErrorResponse } from "@/lib/api-guard";

// 카카오(NextAuth) 세션을 Firebase 로그인으로 바꿔주는 다리.
//
// 이게 있어야 보안 규칙에서 request.auth.uid를 쓸 수 있다. 지금은 브라우저가
// Firebase에 로그인하지 않아 request.auth가 항상 null이고, 그래서 "참여자만
// 읽기" 같은 규칙 자체가 불가능하다.

// firebase-admin은 Node 런타임이 필요하고, 토큰은 절대 캐시되면 안 된다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const caller = await getCaller(req);

    // 표시 이름은 name이 아니라 dname으로 넣는다.
    // name은 Firebase 사용자 레코드의 displayName에 덮여쓰일 수 있다.
    const token = await admin.auth().createCustomToken(caller.uid, {
      dname: caller.name ?? "",
    });

    return NextResponse.json(
      { token, uid: caller.uid },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
