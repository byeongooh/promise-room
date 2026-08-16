import { NextResponse } from "next/server";

import { db } from "@/lib/firebaseAdmin";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 화면에 뿌릴 데이터.
// Firestore 보안 규칙은 그대로 두고, 서버가 Admin SDK로 읽어서 내려준다.
// 비밀번호 해시는 절대 내보내지 않는다.

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const snap = await db.collection("promises").get();

  const promises = snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: (x.title as string) ?? "",
        date: typeof x.date === "string" ? x.date : "",
        time: (x.time as string) ?? "",
        location: (x.location as string) ?? "",
        penalty: (x.penalty as string) ?? "",
        creatorName: (x.creatorName as string) ?? (x.creator as string) ?? "알 수 없음",
        creatorId: (x.creatorId as string) ?? null,
        participantNames: (x.participantNames as string[]) ?? (x.participants as string[]) ?? [],
        participantCount: ((x.participantIds as string[]) ?? []).length,
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    })
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  // 사용자 집계 — 누가 얼마나 쓰고 있는지
  const byCreator = new Map<string, number>();
  for (const p of promises) byCreator.set(p.creatorName, (byCreator.get(p.creatorName) ?? 0) + 1);

  return NextResponse.json(
    {
      total: promises.length,
      creators: [...byCreator.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      promises,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
