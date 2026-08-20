"use client";

import { useState } from "react";
import { Car, Check, Crown, Loader2, MapPin, Search, Send, TrainFront } from "lucide-react";

import OriginSearch, { type FoundPlace } from "@/components/origin-search";
import {
  changePlace as apiChangePlace,
  checkPlace as apiCheckPlace,
  suggestPlace as apiSuggestPlace,
} from "@/lib/api-client";
import { compareSummary, fmtMin, summarize, verdict } from "@/lib/place-compare";
import type { PlaceCheck } from "@/lib/types";

// "여기 말고 다른 데서 만나면?" — 후보를 하나 골라 참여자 전원의 이동시간을
// 한 번에 재는 화면.
//
// 계산은 참여자 누구나 할 수 있다. 아무것도 바꾸지 않기 때문이다. 실제로
// 장소를 바꾸는 것만 만든 사람 권한이고, 나머지 사람은 제안을 올린다.
//
// 자동으로 계산하지 않는다. 후보 한 곳당 참여자 수만큼 외부 API를 부르는데
// (ODsay 하루 1천 건) 검색창에 글자를 칠 때마다 부르면 하루치가 몇 분 만에
// 사라진다. 그래서 검색 결과에서 한 곳을 고른 순간에만 부른다.

function Delta({ sec }: { sec: number }) {
  // 1분 미만 차이는 의미가 없다. 길찾기 결과 자체가 그만큼 흔들린다.
  if (Math.abs(sec) < 60) {
    return (
      <span className="tk-caption shrink-0 rounded-full bg-[var(--tk-ground)] px-1.5 py-0.5 font-bold text-[var(--tk-faint)]">
        비슷
      </span>
    );
  }
  const better = sec < 0;
  return (
    <span
      className={`tk-caption shrink-0 rounded-full px-1.5 py-0.5 font-bold tabular-nums ${
        better
          ? "bg-[var(--ap-leaf)]/12 text-[var(--ap-leaf)]"
          : "bg-[var(--ap-red-weak)] text-[var(--ap-red)]"
      }`}
    >
      {fmtMin(sec)} {better ? "↓" : "↑"}
    </span>
  );
}

/** 평균 · 제일 먼 사람 · 차이. 셋을 나란히 두는 것이 이 화면의 핵심이다. */
function Stat({ label, sec, delta }: { label: string; sec: number; delta: number | null }) {
  return (
    <div className="flex-1 rounded-xl bg-[var(--tk-ground)] px-2 py-2.5 text-center">
      <p className="tk-caption text-[var(--tk-faint)]">{label}</p>
      <p className="mt-1 text-[19px] font-extrabold leading-none tracking-tight tabular-nums">
        {fmtMin(sec)}
      </p>
      {delta !== null && (
        <span className="mt-1.5 inline-block">
          <Delta sec={delta} />
        </span>
      )}
    </div>
  );
}

export default function PlaceCompare({
  promiseId,
  currentPlace,
  isOwner,
  onChanged,
}: {
  promiseId: string;
  /** 지금 약속 장소. 비교의 기준선이 된다. */
  currentPlace: { name: string; lat: number | null; lng: number | null };
  /** 만든 사람이면 바로 바꿀 수 있다. 아니면 제안만. */
  isOwner: boolean;
  /** 장소를 실제로 바꾼 뒤 — 부모가 다시 읽게 한다. */
  onChanged?: () => void;
}) {
  const [result, setResult] = useState<PlaceCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<"change" | "suggest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const check = async (place: FoundPlace) => {
    setChecking(true);
    setError(null);
    setDone(null);
    setResult(null);
    try {
      const res = await apiCheckPlace(promiseId, {
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계산하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  };

  const change = async () => {
    if (!result || busy) return;
    setBusy("change");
    setError(null);
    try {
      await apiChangePlace(promiseId, result.place);
      setDone("장소를 바꿨어요. 모두의 출발 시각도 다시 계산됐습니다.");
      setResult(null);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "장소를 바꾸지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (!result || busy) return;
    setBusy("suggest");
    setError(null);
    try {
      await apiSuggestPlace(promiseId, result.place, result.summary);
      setDone(`${result.place.name}을(를) 제안했어요. 만든 사람이 보고 정합니다.`);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "제안하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  // 지금 장소 대비 차이.
  //
  // 서버가 사람마다 deltaSec(= 후보까지 − 지금까지)을 같이 주므로, 거기서
  // 지금 장소까지의 시간을 되돌려 얻는다. 그 배열을 후보와 똑같은 방식으로
  // 요약해야 평균·최장·편차 셋을 같은 기준으로 견줄 수 있다 — 편차는 특히
  // 개인별 차이의 평균이 아니라 "제일 먼 사람 − 제일 가까운 사람"이라서,
  // 요약을 다시 계산하지 않고는 만들어낼 수 없다.
  const comparable = result?.members.filter((m) => m.deltaSec !== null) ?? [];
  const baseline =
    result && comparable.length === result.members.length && comparable.length > 0
      ? summarize(
          comparable.map((m) => m.durationSec - (m.deltaSec as number)),
          result.summary.skipped
        )
      : null;

  const delta = result && baseline ? compareSummary(result.summary, baseline) : null;
  const say = delta && result ? verdict(delta, result.summary.counted) : null;

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 tk-label text-[var(--tk-faint)]">다 같이 편한 곳 찾기</p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        후보를 고르면 참여자 <b className="text-[var(--tk-sub)]">모두의 이동시간</b>을 한 번에
        재봐요.
      </p>

      <OriginSearch onPick={check} placeholder="후보 장소 검색" />

      {checking && (
        <p className="tk-meta mt-3 flex items-center gap-2 rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-faint)]">
          <Loader2 className="size-3.5 animate-spin" />
          참여자 모두의 길을 재는 중…
        </p>
      )}

      {done && (
        <p className="tk-meta mt-3 flex items-start gap-2 rounded-xl bg-[var(--ap-leaf)]/10 px-4 py-3 text-[var(--ap-leaf)]">
          <Check className="mt-[2px] size-3.5 shrink-0" />
          {done}
        </p>
      )}

      {error && <p className="tk-caption mt-3 text-[var(--tk-warn)]">{error}</p>}

      {result && (
        <div className="mt-3 rounded-xl p-3.5 ring-1 ring-[var(--ap-red-line)]">
          <div className="flex items-start gap-2">
            <MapPin className="mt-[3px] size-4 shrink-0 text-[var(--ap-red)]" />
            <div className="min-w-0 flex-1">
              <p className="tk-title">{result.place.name}</p>
              {result.place.address && (
                <p className="tk-caption mt-0.5 truncate text-[var(--tk-faint)]">
                  {result.place.address}
                </p>
              )}
            </div>
          </div>

          {result.summary.counted === 0 ? (
            <p className="tk-meta mt-3 rounded-xl bg-[var(--tk-ground)] px-3.5 py-3 text-[var(--tk-sub)]">
              출발지를 정한 사람이 없어 비교할 수 없어요. 위 {" "}
              <b className="text-[var(--tk-ink)]">어디서 출발하세요?</b>에서 먼저 정해주세요.
            </p>
          ) : (
            <>
              <p className="mt-3.5 mb-2 tk-label text-[var(--tk-faint)]">여기서 만나면</p>
              <div className="flex gap-1.5">
                <Stat
                  label="평균"
                  sec={result.summary.averageSec}
                  delta={delta?.averageSec ?? null}
                />
                <Stat
                  label="제일 먼 사람"
                  sec={result.summary.maxSec}
                  delta={delta?.maxSec ?? null}
                />
                <Stat
                  label="차이"
                  sec={result.summary.spreadSec}
                  delta={delta?.spreadSec ?? null}
                />
              </div>

              {say && (
                <p
                  className={`tk-note mt-3 rounded-[10px] px-3 py-2.5 ${
                    say.tone === "better"
                      ? "bg-[var(--ap-leaf)]/10 text-[var(--ap-leaf)]"
                      : say.tone === "mixed" || say.tone === "worse"
                        ? "bg-[var(--ap-red-weak)] text-[var(--ap-red)]"
                        : "bg-[var(--tk-ground)] text-[var(--tk-sub)]"
                  }`}
                >
                  {say.line}
                </p>
              )}

              <p className="mt-4 mb-2.5 tk-label text-[var(--tk-faint)]">사람마다 걸리는 시간</p>
              <ul className="space-y-2.5">
                {result.members.map((m) => (
                  <li key={m.uid} className="flex items-center gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--tk-ground)] text-[11px] font-bold">
                      {m.name.trim().charAt(0) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tk-meta block truncate font-medium">{m.name}</span>
                      <span className="tk-caption flex items-center gap-1 text-[var(--tk-faint)]">
                        {m.kind === "car" ? (
                          <Car className="size-3" />
                        ) : (
                          <TrainFront className="size-3" />
                        )}
                        {m.originLabel}에서
                      </span>
                    </span>
                    <span className="tk-meta shrink-0 font-bold tabular-nums">
                      {fmtMin(m.durationSec)}
                    </span>
                    {m.deltaSec !== null && <Delta sec={m.deltaSec} />}
                  </li>
                ))}
              </ul>

              {result.skippedNames.length > 0 && (
                <p className="tk-caption mt-2.5 text-[var(--tk-assistive)]">
                  {result.skippedNames.join(" · ")}
                  {result.skippedNames.length === 1 ? "은" : "는"} 출발지를 안 정해서 빠졌어요
                </p>
              )}

              {/* 방장에게도 "제안하기"를 준다.
                  전에는 방장이 바로 바꾸기만 할 수 있었는데, 그러면 방장은
                  후보를 올릴 방법이 없다. 참여자가 방장 혼자인 플랜에서는
                  제안이 영영 하나도 안 생겨서, 제안 목록의 "이걸로 정하기"
                  버튼을 볼 수조차 없었다. 둘 다 열어두면 방장도 후보를 쌓아놓고
                  견줘본 뒤 고를 수 있다. */}
              <div className="mt-4 flex gap-1.5">
                <button
                  type="button"
                  onClick={suggest}
                  disabled={busy !== null}
                  className={`flex h-12 items-center justify-center gap-1.5 rounded-[10px]
                    text-[14px] font-bold transition disabled:opacity-60 ${
                      isOwner
                        ? "flex-1 bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
                        : "w-full bg-[var(--tk-ink)] text-[var(--tk-paper)] hover:brightness-110"
                    }`}
                >
                  {busy === "suggest" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {isOwner ? "후보로 올리기" : "여기로 하자고 제안하기"}
                </button>

                {isOwner && (
                  <button
                    type="button"
                    onClick={change}
                    disabled={busy !== null}
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px]
                      bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
                      transition hover:brightness-110 disabled:opacity-60"
                  >
                    {busy === "change" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Crown className="size-4" />
                    )}
                    여기로 정하기
                  </button>
                )}
              </div>

              <p className="tk-caption mt-2 text-center text-[var(--tk-assistive)]">
                {isOwner
                  ? "후보로 올리면 다른 사람도 보고 견줄 수 있어요"
                  : "장소를 실제로 정하는 건 플랜 만든 사람만 할 수 있어요"}
              </p>
            </>
          )}
        </div>
      )}

      {!result && !checking && !done && (
        <p className="tk-caption mt-3 flex items-center gap-1.5 text-[var(--tk-assistive)]">
          <Search className="size-3.5 shrink-0" />
          지금 장소는 {currentPlace.name}
        </p>
      )}
    </section>
  );
}
