import { NextResponse } from "next/server";
import { z } from "zod";

import { hashAdminPassword } from "@/lib/admin-password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 비밀번호 해시를 만들어주는 설정용 엔드포인트.
//
// 하는 일은 "받은 문자열의 해시를 계산해서 돌려주는 것"뿐이다.
// 비밀번호를 저장하지도, 관리자 권한을 주지도 않는다. 실제로 적용하려면
// 사람이 직접 환경변수에 넣어야 한다.
// 이미 설정이 끝났으면(=ADMIN_PASSWORD_HASH 존재) 스스로 닫힌다.

const schema = z.object({ password: z.string().min(8, "8자 이상으로 정해주세요.") });

export async function GET() {
  return NextResponse.json({ configured: !!process.env.ADMIN_PASSWORD_HASH });
}

export async function POST(req: Request) {
  if (process.env.ADMIN_PASSWORD_HASH) {
    return NextResponse.json(
      {
        error: "ALREADY_CONFIGURED",
        message: "이미 관리자 비밀번호가 설정되어 있습니다. 이 페이지는 더 이상 쓸 수 없습니다.",
      },
      { status: 410 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "입력값 오류" },
      { status: 400 }
    );
  }

  const hash = await hashAdminPassword(parsed.data.password);

  return NextResponse.json(
    { hash, line: `ADMIN_PASSWORD_HASH=${hash}` },
    { headers: { "Cache-Control": "no-store" } }
  );
}
