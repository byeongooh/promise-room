import { NextResponse } from "next/server";

import { db } from "@/lib/firebaseAdmin";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 화면에 뿌릴 데이터.
// Firestore 보안 규칙은 그대로 두고, 서버가 Admin SDK로 읽어서 내려준다.
// 약속 비밀번호 해시는 절대 내보내지 않는다 (private 하위 컬렉션은 아예 읽지 않는다).

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
        creatorId: (x.creatorId as string) ?? null,
        creatorName: (x.creatorName as string) ?? (x.creator as string) ?? "알 수 없음",
        participantIds: (x.participantIds as string[]) ?? [],
        participantNames: (x.participantNames as string[]) ?? (x.participants as string[]) ?? [],
      };
    })
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

  // 사용자 목록을 만든다. 접근 권한은 uid로 정해지므로 uid를 기준으로 모은다.
  const counts = new Map<string, { created: number; joined: number }>();
  // 한 uid에 여러 이름이 붙어 있을 수 있어(예: 표시용으로 바꾼 이름)
  // 가장 많이 쓰인 이름을 그 사람의 이름으로 삼는다.
  const nameVotes = new Map<string, Map<string, number>>();

  const vote = (uid: string, name?: string) => {
    if (!name || name === "알 수 없음") return;
    const m = nameVotes.get(uid) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    nameVotes.set(uid, m);
  };
  const bump = (uid: string, key: "created" | "joined") => {
    const c = counts.get(uid) ?? { created: 0, joined: 0 };
    c[key] += 1;
    counts.set(uid, c);
  };

  for (const p of promises) {
    if (p.creatorId) {
      bump(p.creatorId, "created");
      vote(p.creatorId, p.creatorName);
    }
    p.participantIds.forEach((uid, i) => {
      bump(uid, "joined");
      vote(uid, p.participantNames[i]);
    });
  }

  const users = [...counts.entries()]
    .map(([uid, c]) => {
      const votes = [...(nameVotes.get(uid)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
      return { uid, name: votes[0]?.[0] ?? "알 수 없음", ...c };
    })
    .sort((a, b) => b.joined - a.joined);

  return NextResponse.json(
    { total: promises.length, users, promises },
    { headers: { "Cache-Control": "no-store" } }
  );
}
