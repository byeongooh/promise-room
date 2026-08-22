import { NextResponse } from "next/server";
import { z } from "zod";

import { admin } from "@/lib/firebaseAdmin";
import { badRequest, toErrorResponse } from "@/lib/api-guard";
import { verifyKakaoAccessToken } from "@/lib/kakao-identity";

// 앱(React Native)이 로그인하는 자리.
//
// 웹과 앱은 카카오까지 가는 길이 다르다.
//
//   웹 : 카카오 → NextAuth 세션 쿠키 → /api/firebase/token → Firebase 토큰
//   앱 : 카카오 → (카카오 액세스 토큰) → **여기** → Firebase 토큰
//
// 앱에는 NextAuth 쿠키가 없어서 /api/firebase/token을 부를 수가 없다. 쿠키는
// 브라우저 로그인으로만 생기기 때문이다. 그 닭과 달걀을 여기서 끊는다.
//
// **여기만 있으면 나머지 API는 손댈 게 없다.** lib/api-guard.ts가 처음부터
// `Authorization: Bearer <Firebase ID 토큰>`을 받게 되어 있어서(그 자리를 앱을
// 위해 미리 비워뒀다), 앱은 아래에서 받은 토큰으로 Firebase에 로그인한 뒤
// ID 토큰을 헤더에 실어 기존 API를 그대로 부르면 된다.
//
// 앱 쪽 순서:
//   1. 카카오 SDK로 로그인 → 액세스 토큰
//   2. 이 엔드포인트에 보내 커스텀 토큰을 받는다
//   3. signInWithCustomToken(auth, token)
//   4. getIdToken() → 모든 API 호출에 Bearer로 붙인다
//
// 커스텀 토큰은 비밀이라 절대 캐시되면 안 된다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  /** 카카오 SDK가 앱에 준 액세스 토큰 */
  accessToken: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw badRequest("accessToken이 필요합니다.");

    // 신원은 카카오에 직접 물어서 정한다. 앱이 보낸 값은 토큰뿐이다.
    const { uid, name } = await verifyKakaoAccessToken(parsed.data.accessToken);

    // 표시 이름을 name이 아니라 dname으로 넣는 이유는 /api/firebase/token과 같다 —
    // name은 Firebase 사용자 레코드의 displayName에 덮여쓰일 수 있다.
    const token = await admin.auth().createCustomToken(uid, { dname: name ?? "" });

    return NextResponse.json(
      { token, uid, name },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
