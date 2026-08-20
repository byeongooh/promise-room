"use client";

import { useMemo, useState } from "react";
import { Car, Check, Clock, Loader2, MapPinOff, TrainFront, UserMinus } from "lucide-react";

import { updateMyMember, type MemberStatus } from "@/lib/api-client";
import { usePromiseMembers } from "@/hooks/use-promise-members";
import { isStatusOpen, statusOpensWhen } from "@/lib/plan-phase";
import { getPromiseDate } from "@/lib/promise-time";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { MemberRoute, PromiseData, PromiseMember } from "@/lib/types";

// 누가 어떻게 오고 있는지 한자리에 모아 보여준다.
//
// 이 화면이 이 프로젝트의 다음 목적지(실시간 위치 공유)로 가는 첫 계단이다.
// 지금은 "무엇을 타고 오는지", "몇 시에 도착한다고 했는지", "본인이 누른
// 상태"까지 보여주고, 좌표가 붙으면 여기에 얹는다.

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

/**
 * "6:30 도착" — 약속 시각과 다르면 몇 분 차이인지도 같이.
 *
 * 약속 시각과 같으면 아무것도 안 그린다. 전원이 정시라고 적어둔 목록에서
 * 모두에게 같은 시각이 반복되면 정작 다른 사람이 눈에 안 띈다.
 */
function ArrivalChip({ arrivalAt, meetingAt }: { arrivalAt: string; meetingAt: Date | null }) {
  const at = new Date(arrivalAt);
  if (Number.isNaN(at.getTime())) return null;

  const diffMin = meetingAt ? Math.round((at.getTime() - meetingAt.getTime()) / 60_000) : 0;
  if (meetingAt && diffMin === 0) return null;

  const label = at.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

  return (
    <span
      className={`tk-caption flex items-center gap-1 rounded-full px-2 py-0.5 ${
        diffMin > 0
          ? "bg-[var(--ap-red-weak)] text-[var(--ap-red)]"
          : "bg-[var(--tk-now-bg)] text-[var(--tk-now-ink)]"
      }`}
    >
      <Clock className="size-3" />
      {label} 도착
      {diffMin !== 0 && ` (${diffMin > 0 ? "+" : ""}${diffMin}분)`}
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
  const { byUid: members, blocked } = usePromiseMembers(promiseId);
  const [saving, setSaving] = useState<MemberStatus | null>(null);

  const meetingAt = getPromiseDate(promiseData);

  // 상태 버튼은 당일 아침에 열린다. 2주 남은 약속에 "가는 중"을 누를 수 있으면
  // 그 값이 아무 뜻도 없어진다 — 자동 감지가 아니라 사람이 누르는 신호라서,
  // 누를 수 있는 때를 좁히는 것 자체가 신호의 정확도다.
  const statusOpen = isStatusOpen(promiseData);

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

  const goingCount = roster.filter((r) => r.member?.attendance !== "cant").length;

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
      <p className="mb-3 tk-label text-[var(--tk-faint)]">
        참여자 {roster.length}명
        {goingCount !== roster.length && (
          <span className="ml-1.5 text-[var(--ap-red)]">· {goingCount}명 참석</span>
        )}
      </p>

      {roster.length === 0 ? (
        <p className="tk-meta py-2 text-[var(--tk-faint)]">아직 참여자가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {roster.map((r) => {
            const isMe = !!myKey && !!r.uid && (normalizeKakaoId(r.uid) ?? r.uid) === myKey;
            const status: MemberStatus = r.member?.status ?? "unknown";
            const cant = r.member?.attendance === "cant";
            const objection = r.member?.placeObjection ?? null;

            return (
              <li key={r.key} className={`flex items-start gap-2.5 ${cant ? "opacity-60" : ""}`}>
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

                    {/* 못 가는 사람에게는 상태·도착 시각이 의미가 없다. */}
                    {cant ? (
                      <span className="tk-caption flex items-center gap-1 rounded-full bg-[var(--tk-ground)] px-2 py-0.5 text-[var(--tk-faint)]">
                        <UserMinus className="size-3" />못 감
                      </span>
                    ) : (
                      <>
                        {!blocked && statusOpen && (
                          <span
                            className={`tk-caption rounded-full px-2 py-0.5 ${STATUS_TONE[status]}`}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        )}
                        {r.member?.arrivalAt && (
                          <ArrivalChip arrivalAt={r.member.arrivalAt} meetingAt={meetingAt} />
                        )}
                      </>
                    )}
                  </span>

                  {cant && r.member?.absenceReason && (
                    <span className="tk-caption mt-0.5 block text-[var(--tk-faint)]">
                      &ldquo;{r.member.absenceReason}&rdquo;
                    </span>
                  )}

                  {objection && (
                    <span className="tk-caption mt-0.5 flex items-start gap-1 text-[var(--ap-red)]">
                      <MapPinOff className="mt-[3px] size-3 shrink-0" />
                      <span className="min-w-0">
                        이 장소는 가기 어렵대요
                        {objection.reason && ` — ${objection.reason}`}
                      </span>
                    </span>
                  )}

                  {!cant &&
                    (r.member?.route ? (
                      <RouteLine route={r.member.route} leaveAt={r.member.leaveAt ?? null} />
                    ) : (
                      !blocked && (
                        <span className="tk-caption mt-0.5 block text-[var(--tk-faint)]">
                          아직 어떻게 올지 안 정했습니다
                        </span>
                      )
                    ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* 내 상태 — 자동 감지가 아니라 직접 누른다. 약속을 인지했다는 신호로 쓴다.
          당일 전에는 버튼을 감추되 자리는 남긴다. 그냥 없애면 사라진 줄 안다. */}
      {myKey && !blocked && (
        <div className="mt-4 border-t border-dashed border-[var(--tk-line)] pt-3">
          <p className="tk-caption mb-2 text-[var(--tk-faint)]">지금 나는</p>
          {statusOpen ? (
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
          ) : (
            <p className="tk-caption rounded-xl bg-[var(--tk-ground)] px-3 py-2.5 text-[var(--tk-faint)]">
              확인 · 가는 중 · 도착은 {statusOpensWhen(promiseData)}.
            </p>
          )}
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
