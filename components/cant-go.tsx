"use client";

import { useState } from "react";
import { Loader2, MapPinOff, Undo2, UserMinus, X } from "lucide-react";

import { updateMyMember } from "@/lib/api-client";
import type { MemberAttendance, PlaceObjection } from "@/lib/types";

// "못 가요"와 관련된 것들을 한자리에 모은다.
//
// 두 가지가 있고 서로 다르다.
//   1. 이 장소는 가기 어려워요 — 장소에 대한 이의. 장소가 바뀌면 없어진다.
//   2. 이번엔 못 가요        — 이 플랜에 안 간다. 장소와 무관할 수도 있다.
//
// 둘 다 방에서 나가는 것(참여 취소)이 아니다. 명단에는 그대로 남는다.
// 장소 때문에 못 가는 사람을 방에서 빼버리면, 장소가 바뀌어 갈 수 있게 돼도
// 돌아올 방법이 비밀번호밖에 없다. 그리고 방장이 "한 명은 못 온다"를 보고
// 다시 정하려면 그 사람이 명단에 남아 있어야 한다.

export default function CantGo({
  promiseId,
  placeName,
  online,
  attendance,
  absenceReason,
  placeObjection,
  onChanged,
  onSuggestPlace,
}: {
  promiseId: string;
  /** 지금 정해진 장소 이름. 온라인이면 안 쓴다. */
  placeName: string;
  online: boolean;
  attendance: MemberAttendance;
  absenceReason: string | null;
  placeObjection: PlaceObjection | null;
  onChanged?: () => void;
  /** "다른 장소 제안하기" — 부모가 장소 비교 칸으로 데려간다. */
  onSuggestPlace?: () => void;
}) {
  const [form, setForm] = useState<null | "place" | "absence">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cant = attendance === "cant";

  const run = async (key: string, patch: Parameters<typeof updateMyMember>[1]) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await updateMyMember(promiseId, patch);
      setForm(null);
      setReason("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 tk-label text-[var(--tk-faint)]">가기 어려울 때</p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        말해두면 방장이 다시 정할 수 있어요. 방에서 나가는 건 아니에요.
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      {/* ---------------- 이미 올린 것들 ---------------- */}

      {placeObjection && (
        <div className="mb-2 rounded-xl bg-[var(--ap-red-weak)] p-3.5">
          <p className="tk-caption flex items-center gap-1.5 font-bold text-[var(--ap-red)]">
            <MapPinOff className="size-3.5 shrink-0" />
            {placeObjection.placeName} — 가기 어렵다고 알렸어요
          </p>
          {placeObjection.reason && (
            <p className="tk-caption mt-1.5 text-[var(--tk-sub)]">
              &ldquo;{placeObjection.reason}&rdquo;
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {onSuggestPlace && (
              <button
                type="button"
                onClick={onSuggestPlace}
                className="tk-caption h-9 rounded-full bg-[var(--tk-paper)] px-3 font-bold
                  text-[var(--tk-ink)] transition hover:brightness-95"
              >
                다른 장소 제안하기
              </button>
            )}
            <button
              type="button"
              onClick={() => run("drop-place", { placeObjection: null })}
              disabled={busy !== null}
              className="tk-caption flex h-9 items-center gap-1 rounded-full px-3
                text-[var(--tk-faint)] transition hover:text-[var(--tk-sub)] disabled:opacity-60"
            >
              {busy === "drop-place" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              거두기
            </button>
          </div>
        </div>
      )}

      {cant && (
        <div className="mb-2 rounded-xl bg-[var(--tk-ground)] p-3.5">
          <p className="tk-caption flex items-center gap-1.5 font-bold text-[var(--tk-ink)]">
            <UserMinus className="size-3.5 shrink-0" />
            이번엔 못 간다고 알렸어요
          </p>
          {absenceReason && (
            <p className="tk-caption mt-1.5 text-[var(--tk-sub)]">
              &ldquo;{absenceReason}&rdquo;
            </p>
          )}
          <button
            type="button"
            onClick={() => run("going", { attendance: "going" })}
            disabled={busy !== null}
            className="tk-caption mt-2.5 flex h-9 items-center gap-1 rounded-full
              bg-[var(--tk-paper)] px-3 font-bold text-[var(--tk-ink)]
              transition hover:brightness-95 disabled:opacity-60"
          >
            {busy === "going" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Undo2 className="size-3.5" />
            )}
            역시 갈 수 있어요
          </button>
        </div>
      )}

      {/* ---------------- 사유 적는 칸 ---------------- */}

      {form && (
        <div className="mb-2 rounded-xl bg-[var(--tk-ground)] p-3.5">
          <label className="tk-caption mb-1.5 block text-[var(--tk-sub)]">
            {form === "place"
              ? `${placeName} — 왜 어려운지 적어주세요 (안 적어도 돼요)`
              : "왜 못 가는지 적어주세요 (안 적어도 돼요)"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder={
              form === "place" ? "집에서 두 시간 걸려요" : "그날 야근이라 못 가요"
            }
            className="w-full resize-none rounded-lg bg-[var(--tk-paper)] px-3 py-2.5 text-[13px]
              text-[var(--tk-ink)] outline-none placeholder:text-[var(--tk-assistive)]"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() =>
                form === "place"
                  ? run("send-place", { placeObjection: reason })
                  : run("send-absence", { attendance: "cant", absenceReason: reason })
              }
              disabled={busy !== null}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px]
                bg-[var(--tk-ink)] text-[13px] font-bold text-[var(--tk-paper)]
                transition hover:brightness-110 disabled:opacity-60"
            >
              {busy?.startsWith("send") && <Loader2 className="size-3.5 animate-spin" />}
              보내기
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setReason("");
              }}
              disabled={busy !== null}
              className="tk-caption h-10 px-4 font-bold text-[var(--tk-faint)]
                transition hover:text-[var(--tk-sub)] disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ---------------- 시작 버튼 ---------------- */}

      {!form && (
        <div className="flex flex-wrap gap-1.5">
          {/* 온라인 플랜에는 "장소가 멀다"가 성립하지 않는다. */}
          {!online && !placeObjection && (
            <button
              type="button"
              onClick={() => setForm("place")}
              className="tk-caption flex h-10 items-center gap-1.5 rounded-full
                bg-[var(--tk-ground)] px-3.5 text-[var(--tk-sub)] transition hover:brightness-95"
            >
              <MapPinOff className="size-3.5" />이 장소는 가기 어려워요
            </button>
          )}
          {!cant && (
            <button
              type="button"
              onClick={() => setForm("absence")}
              className="tk-caption flex h-10 items-center gap-1.5 rounded-full
                bg-[var(--tk-ground)] px-3.5 text-[var(--tk-sub)] transition hover:brightness-95"
            >
              <UserMinus className="size-3.5" />
              이번엔 못 가요
            </button>
          )}
        </div>
      )}
    </section>
  );
}
