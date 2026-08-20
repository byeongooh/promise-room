"use client";

import { useState } from "react";
import { Crown, Loader2, X } from "lucide-react";

import {
  changePlace as apiChangePlace,
  removePlaceSuggestion as apiRemoveSuggestion,
} from "@/lib/api-client";
import { fmtMin } from "@/lib/place-compare";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { PlaceSuggestion } from "@/lib/types";

// 참여자들이 계산해서 올린 장소 후보들.
//
// 만든 사람에게는 "이걸로 정하기"가, 올린 본인에게는 "거두기"가 보인다.
//
// 여기 숫자는 제안한 시점에 잰 값이고 다시 계산하지 않는다. 목록을 열 때마다
// 다시 재면 제안 수 × 참여자 수만큼 외부 API를 부르게 되는데 ODsay가 하루
// 1천 건이라 감당이 안 된다. 대신 언제 잰 값인지를 화면에 밝힌다.

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function PlaceSuggestions({
  promiseId,
  suggestions,
  isOwner,
  myUid,
  onChanged,
}: {
  promiseId: string;
  suggestions: PlaceSuggestion[];
  isOwner: boolean;
  myUid?: string;
  /** 장소를 바꾸거나 제안을 거둔 뒤 — 부모가 다시 읽게 한다. */
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  const myKey = normalizeKakaoId(myUid);

  const accept = async (s: PlaceSuggestion) => {
    if (busy) return;
    setBusy(s.id);
    setError(null);
    try {
      await apiChangePlace(promiseId, s.place);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "장소를 바꾸지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const drop = async (s: PlaceSuggestion) => {
    if (busy) return;
    setBusy(s.id);
    setError(null);
    try {
      await apiRemoveSuggestion(promiseId, s.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "제안을 거두지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
        <Crown className="size-3.5 text-[var(--ap-honey)]" />
        올라온 장소 제안 {suggestions.length}
      </p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        {isOwner
          ? "올라온 후보들이에요. 어디로 할지는 만든 사람이 정합니다."
          : "만든 사람이 보고 정합니다."}
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      <ul className="space-y-2">
        {suggestions.map((s) => {
          const mine = !!myKey && normalizeKakaoId(s.byUid) === myKey;
          const working = busy === s.id;

          return (
            <li key={s.id} className="rounded-xl bg-[var(--tk-ground)] p-3.5">
              <p className="tk-caption text-[var(--tk-faint)]">
                {s.byName}
                {mine ? " (나)" : ""}가 제안 · {ago(s.createdAt)}
              </p>

              <p className="tk-title mt-1.5">{s.place.name}</p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="tk-caption rounded-full bg-[var(--tk-paper)] px-2.5 py-1 text-[var(--tk-faint)]">
                  평균{" "}
                  <b className="tabular-nums text-[var(--tk-ink)]">
                    {fmtMin(s.summary.averageSec)}
                  </b>
                </span>
                <span className="tk-caption rounded-full bg-[var(--tk-paper)] px-2.5 py-1 text-[var(--tk-faint)]">
                  제일 먼 사람{" "}
                  <b className="tabular-nums text-[var(--tk-ink)]">{fmtMin(s.summary.maxSec)}</b>
                </span>
                <span className="tk-caption rounded-full bg-[var(--tk-paper)] px-2.5 py-1 text-[var(--tk-faint)]">
                  차이{" "}
                  <b className="tabular-nums text-[var(--tk-ink)]">{fmtMin(s.summary.spreadSec)}</b>
                </span>
              </div>

              <p className="tk-caption mt-2 text-[var(--tk-assistive)]">
                {s.summary.counted}명 기준으로 잰 값이에요
                {s.summary.skipped > 0 && ` · ${s.summary.skipped}명은 출발지 미정`}
              </p>

              <div className="mt-3 flex gap-1.5">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => accept(s)}
                    disabled={busy !== null}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px]
                      bg-[var(--tk-ink)] text-[13px] font-bold text-[var(--tk-paper)]
                      transition hover:brightness-110 disabled:opacity-60"
                  >
                    {working && <Loader2 className="size-3.5 animate-spin" />}
                    이걸로 정하기
                  </button>
                )}
                {(isOwner || mine) && (
                  <button
                    type="button"
                    onClick={() => drop(s)}
                    disabled={busy !== null}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-[10px]
                      text-[13px] font-bold text-[var(--tk-faint)] transition
                      hover:text-[var(--tk-sub)] disabled:opacity-60 ${
                        isOwner ? "px-4" : "flex-1 bg-[var(--tk-paper)]"
                      }`}
                  >
                    <X className="size-3.5" />
                    거두기
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
