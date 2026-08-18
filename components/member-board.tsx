"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Car, Check, Loader2, TrainFront } from "lucide-react";

import { db } from "@/lib/firebase";
import { updateMyMember, type MemberStatus } from "@/lib/api-client";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { MemberRoute, PromiseData, PromiseMember } from "@/lib/types";

// 누가 어떻게 오고 있는지 한자리에 모아 보여준다.
//
// 이 화면이 이 프로젝트의 다음 목적지(실시간 위치 공유)로 가는 첫 계단이다.
// 지금은 "무엇을 타고 오는지"와 "본인이 누른 상태"까지만 보여주고,
// 좌표가 붙으면 여기에 얹는다.

const STATUS_LABEL: Record<MemberStatus, string> = {
  unknown: "확인 안 함",
  onway: "가는 중",
  arrived: "도착",
};

const STATUS_TONE: Record<MemberStatus, string> = {
  unknown: "bg-[var(--tk-ground)] text-[var(--tk-faint)]",
  onway: "bg-[var(--tk-hot-bg)] text-[var(--tk-hot-ink)]",
  arrived: "bg-[var(--tk-now-bg)] text-[var(--tk-now-ink)]",
};

const ORDER: MemberStatus[] = ["unknown", "onway", "arrived"];

function formatDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** "오후 6:12" — 언제 나서야 하는지. */
function formatClock(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function RouteLine({ route, leaveAt }: { route: MemberRoute; leaveAt: string | null }) {
  const clock = leaveAt ? formatClock(leaveAt) : null;
  const late = leaveAt ? new Date(leaveAt).getTime() < Date.now() : false;

  return (
    <span className="tk-caption mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[var(--tk-faint)]">
      {route.kind === "car" ? (
        <Car className="size-3.5 shrink-0" />
      ) : (
        <TrainFront className="size-3.5 shrink-0" />
      )}
      <span className="text-[var(--tk-sub)]">{route.label}</span>
      <span>· {formatDuration(route.durationSec)}</span>
      {route.origin?.label && <span className="truncate">· {route.origin.label}에서</span>}
      {clock && (
        <span className={late ? "font-bold text-[var(--tk-warn)]" : ""}>
          · {clock} 출발{late ? " (지났음)" : ""}
        </span>
      )}
    </span>
  );
}

export default function MemberBoard({
  promiseId,
  promiseData,
  myUid,
}: {
  promiseId: string;
  promiseData: PromiseData;
  /** 세션의 내 uid. 내 줄에만 상태 버튼을 붙인다. */
  myUid?: string;
}) {
  const [members, setMembers] = useState<Record<string, PromiseMember>>({});
  /** 규칙을 아직 배포하지 않았으면 이 컬렉션을 못 읽는다. 그때만 true. */
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState<MemberStatus | null>(null);

  useEffect(() => {
    if (!promiseId) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // 구독을 한 박자 늦게 건다.
    //
    // React StrictMode는 개발 중 effect를 붙였다 떼고 다시 붙인다. 그걸 그대로
    // 두면 Firestore가 같은 감시 대상을 순식간에 추가·삭제하면서 내부 단언에
    // 걸려 터진다("INTERNAL ASSERTION FAILED ... ca9"). 한 프레임 미루면
    // 첫 번째 왕복은 구독을 만들기 전에 취소되므로 리스너가 하나만 남는다.
    const timer = setTimeout(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        collection(db, "promises", promiseId, "members"),
        (snap) => {
          setBlocked(false);
          const next: Record<string, PromiseMember> = {};
          snap.forEach((d) => {
            next[normalizeKakaoId(d.id) ?? d.id] = { ...(d.data() as PromiseMember), uid: d.id };
          });
          setMembers(next);
        },
        (err) => {
          // 규칙 배포 전에는 여기로 온다. 화면 전체를 깨뜨리지 않고 조용히 접는다.
          console.warn("[member-board] 참여자 상태를 읽지 못함:", err.code);
          setBlocked(true);
        }
      );
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [promiseId]);

  // 명단은 participantIds를 기준으로 세운다. 이름 배열은 순서가 어긋날 수
  // 있어서(중복 이름을 arrayRemove하면 엉뚱한 칸이 빠진다) 이름을 못 찾으면
  // member 문서에 저장된 이름으로 메운다.
  const roster = useMemo(() => {
    const ids = promiseData.participantIds ?? [];
    const names = promiseData.participantNames ?? [];

    const creatorKey = normalizeKakaoId(promiseData.creatorId);
    const creatorName = promiseData.creatorName ?? promiseData.creator ?? null;

    if (ids.length === 0) {
      // v1 레거시 문서 — 이름만 있다. 상태는 못 붙이고 이름만 보여준다.
      const legacy = [...(promiseData.participants ?? []), ...names];
      return Array.from(new Set(legacy)).map((name) => ({
        key: name,
        uid: null as string | null,
        name,
        member: null as PromiseMember | null,
        isCreator: name === creatorName,
      }));
    }

    return ids.map((uid, i) => {
      const key = normalizeKakaoId(uid) ?? uid;
      const member = members[key] ?? null;
      return {
        key: uid,
        uid,
        name: member?.name || names[i] || "참여자",
        member,
        isCreator: creatorKey ? key === creatorKey : false,
      };
    });
  }, [promiseData, members]);

  const myKey = normalizeKakaoId(myUid);
  const myStatus: MemberStatus = (myKey && members[myKey]?.status) || "unknown";

  const setStatus = async (status: MemberStatus) => {
    if (saving) return;
    setSaving(status);
    try {
      await updateMyMember(promiseId, { status });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-3 tk-label text-[var(--tk-faint)]">참여자 {roster.length}명</p>

      {roster.length === 0 ? (
        <p className="tk-meta py-2 text-[var(--tk-faint)]">아직 참여자가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {roster.map((r) => {
            const isMe = !!myKey && !!r.uid && (normalizeKakaoId(r.uid) ?? r.uid) === myKey;
            const status: MemberStatus = r.member?.status ?? "unknown";

            return (
              <li key={r.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--tk-ground)] text-[12px] font-bold text-[var(--tk-ink)]">
                  {r.name.trim().charAt(0) || "?"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="tk-meta font-medium text-[var(--tk-ink)]">{r.name}</span>
                    {isMe && <span className="tk-caption text-[var(--tk-faint)]">나</span>}
                    {r.isCreator && (
                      <span className="tk-caption text-[var(--tk-faint)]">플랜 만든 사람</span>
                    )}
                    {!blocked && (
                      <span
                        className={`tk-caption rounded-full px-2 py-0.5 ${STATUS_TONE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    )}
                  </span>

                  {r.member?.route ? (
                    <RouteLine route={r.member.route} leaveAt={r.member.leaveAt ?? null} />
                  ) : (
                    !blocked && (
                      <span className="tk-caption mt-0.5 block text-[var(--tk-faint)]">
                        아직 어떻게 올지 안 정했습니다
                      </span>
                    )
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* 내 상태 — 자동 감지가 아니라 직접 누른다. 약속을 인지했다는 신호로 쓴다. */}
      {myKey && !blocked && (
        <div className="mt-4 border-t border-dashed border-[var(--tk-line)] pt-3">
          <p className="tk-caption mb-2 text-[var(--tk-faint)]">지금 나는</p>
          <div className="flex gap-1.5">
            {ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                disabled={saving !== null}
                className={`tk-caption flex h-11 flex-1 items-center justify-center gap-1
                  rounded-xl transition disabled:opacity-60 ${
                    myStatus === s
                      ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                      : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
                  }`}
              >
                {saving === s ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : myStatus === s ? (
                  <Check className="size-3.5" />
                ) : null}
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {blocked && (
        <p className="tk-caption mt-3 rounded-xl bg-[var(--tk-ground)] px-3 py-2 text-[var(--tk-faint)]">
          참여자별 경로·상태는 Firebase 콘솔에 새 보안 규칙을 배포한 뒤에 보입니다.
        </p>
      )}
    </section>
  );
}
