import { NextResponse } from "next/server";
import { z } from "zod";

import { startAdminSession, endAdminSession, verifyAdminPassword } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ password: z.string().min(1) });

// 무차별 대입을 늦추기 위한 아주 단순한 제한.
// 서버리스라 인스턴스마다 따로 세지지만, 없는 것보다는 낫다.
let failures = 0;
let blockedUntil = 0;

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD_HASH) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "관리자 비밀번호가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  if (Date.now() < blockedUntil) {
    const sec = Math.ceil((blockedUntil - Date.now()) / 1000);
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", message: `${sec}초 후에 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const ok = await verifyAdminPassword(parsed.data.password);

  if (!ok) {
    failures += 1;
    if (failures >= 5) {
      blockedUntil = Date.now() + 60_000;
      failures = 0;
    }
    // 타이밍으로 정답 여부를 유추하기 어렵게 살짝 지연
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json(
      { error: "WRONG_PASSWORD", message: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  failures = 0;
  await startAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await endAdminSession();
  return NextResponse.json({ ok: true });
}
