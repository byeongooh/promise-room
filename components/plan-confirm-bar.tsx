"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MapPinOff, Pencil, UserMinus } from "lucide-react";

import { setPlanConfirmed } from "@/lib/api-client";
import { isPlanConfirmed, missingForConfirm } from "@/lib/plan-phase";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { PromiseData, PromiseMember } from "@/lib/types";

// 방장이 "이걸로 하자"를 누르는 자리 — 그리고 되돌리는 자리.
//
// 확정을 되돌릴 수 있게 만든 것이 이 기능의 핵심 판단이다. 확정한 뒤에 "그
// 장소는 나한테 무리다"라는 말이 나오는 게 실제로 흔한데, 그때 방을 새로
// 파게 하면 그때까지의 투표·출발지·제안이 전부 날아간다. 확정은 문을 잠그는
// 게 아니라 되돌릴 수 있는 표시다.
//
// 그래서 되돌리기 버튼 옆에 "누가 왜 어렵다고 했는지"를 같이 둔다. 방장이
// 되돌릴지 말지 정하려면 그 이유가 그 자리에 있어야 한다.

interface Voice {
  name: string;
  kind: "place" | "absence";
  reason: string;
}

export default function PlanConfirmBar({
  promiseId,
  promiseData,
  isOwner,
  members,
  onChanged,
}: {
  promiseId: string;
  promiseData: PromiseData;
  isOwner: boolean;
  /** normalizeKakaoId를 통과한 uid → member 문서 */
  members: Record<string, PromiseMember>;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = isPlanConfirmed(promiseData);
  const missing = missingForConfirm(promiseData);

  // 못 가겠다는 말들. 확정 뒤에 이게 하나라도 있으면 방장에게 보여준다.
  const voices = useMemo<Voice[]>(() => {
    const ids = promiseData.participantIds ?? [];
    const names = promiseData.participantNames ?? [];
    const out: Voice[] = [];

    ids.forEach((uid, i) => {
      const m = members[normalizeKakaoId(uid) ?? uid];
      if (!m) return;
      const name = m.name || names[i] || "참여자";
      if (m.placeObjection) {
        out.push({ name, kind: "place", reason: m.placeObjection.reason });
      }
      if (m.attendance === "cant") {
        out.push({ name, kind: "absence", reason: m.absenceReason ?? "" });
      }
    });
    return out;
  }, [promiseData, members]);

  const flip = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPlanConfirmed(promiseId, next);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  // 방장이 아니면 확정 자체는 손댈 수 없다. 다만 "못 간다"는 말이 올라와 있으면
  // 그건 모두가 알아야 한다 — 나만 모르고 그 장소로 가고 있으면 안 되니까.
  if (!isOwner) {
    if (!confirmed || voices.length === 0) return null;
    return (
      <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
        <p className="mb-2.5 tk-label text-[var(--tk-faint)]">아직 정리 안 된 것</p>
        <VoiceList voices={voices} />
        <p className="tk-caption mt-2.5 text-[var(--tk-assistive)]">
          다시 정할지는 방장이 결정해요.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      {confirmed ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 tk-label text-[var(--ap-leaf)]">
            <CheckCircle2 className="size-3.5" /> 확정된 플랜이에요
          </p>

          {voices.length > 0 ? (
            <>
              <p className="tk-caption mb-2.5 text-[var(--tk-sub)]">
                그런데 {voices.length}명이 어렵다고 했어요. 다시 정할 수 있어요.
              </p>
              <VoiceList voices={voices} />
            </>
          ) : (
            <p className="tk-caption mb-1 text-[var(--tk-faint)]">
              바꿀 일이 생기면 언제든 다시 정하는 중으로 되돌릴 수 있어요.
            </p>
          )}

          <button
            type="button"
            onClick={() => flip(false)}
            disabled={busy}
            className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl
              bg-[var(--tk-ground)] text-[13px] font-bold text-[var(--tk-ink)]
              transition hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
            다시 정하기
          </button>
          <p className="tk-caption mt-2 text-center text-[var(--tk-assistive)]">
            날짜와 장소는 지워지지 않아요. 고칠 수 있게 열어두기만 해요.
          </p>
        </>
      ) : (
        <>
          <p className="mb-1 tk-label text-[var(--tk-faint)]">정하는 중이에요</p>
          <p className="tk-caption mb-3 text-[var(--tk-faint)]">
            {missing.length > 0
              ? `${missing.join("와 ")}를 정하면 확정할 수 있어요.`
              : "날짜와 장소가 다 정해졌어요. 확정하면 모두에게 확정된 플랜으로 보여요."}
          </p>

          <button
            type="button"
            onClick={() => flip(true)}
            disabled={busy || missing.length > 0}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl
              bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
              transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            이걸로 확정하기
          </button>
        </>
      )}
    </section>
  );
}

function VoiceList({ voices }: { voices: Voice[] }) {
  return (
    <ul className="space-y-1.5">
      {voices.map((v, i) => (
        <li
          key={`${v.name}-${v.kind}-${i}`}
          className={`rounded-xl p-3 ${
            v.kind === "place" ? "bg-[var(--ap-red-weak)]" : "bg-[var(--tk-ground)]"
          }`}
        >
          <p
            className={`tk-caption flex items-center gap-1.5 font-bold ${
              v.kind === "place" ? "text-[var(--ap-red)]" : "text-[var(--tk-ink)]"
            }`}
          >
            {v.kind === "place" ? (
              <MapPinOff className="size-3.5 shrink-0" />
            ) : (
              <UserMinus className="size-3.5 shrink-0" />
            )}
            {v.name} · {v.kind === "place" ? "이 장소는 가기 어려움" : "이번엔 못 감"}
          </p>
          {v.reason && (
            <p className="tk-caption mt-1 text-[var(--tk-sub)]">
              &ldquo;{v.reason}&rdquo;
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
