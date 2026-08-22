"use client";

import { useCallback, useEffect, useState } from "react";
import { Apple, Check, Clock, Loader2, Sprout, UserX } from "lucide-react";

import AppleGauge from "@/components/apple-gauge";
import { fetchHarvest, submitHarvest } from "@/lib/api-client";
import { formatDelta } from "@/lib/brix";
import { progressLine, resultLine, type HarvestVote } from "@/lib/harvest";
import type { HarvestState } from "@/lib/harvest-service";

// 수확 — 약속이 끝난 뒤 서로 "제시간에 왔는지"를 묻고 결과를 보여준다.
// 이 앱이 재려는 평판이 실제로 만들어지는 유일한 자리다.
//
// 한 칸이 네 국면을 전부 맡는다. 국면마다 다른 화면으로 보내지 않은 이유:
// 수확은 플랜에 딸린 일이라 플랜을 보다가 그 자리에서 끝나야 한다. 화면을
// 옮기게 하면 "나중에 하지" 하고 안 한다 — 메모를 약속 안에 넣은 것과 같은 판단이다.
//
//   waiting  — 아직 약속이 안 끝났다. 아무것도 안 그린다
//   open     — 표를 낼 수 있다 (아직 안 냈으면 평가, 냈으면 대기)
//   settled  — 정산 끝. 결과
//
// **정산 전에는 남의 표가 어디에도 안 온다.** 화면에서 감추는 게 아니라
// 서버가 안 준다(lib/harvest-service.ts 참고). 그래야 눈치보기와 담합이 막힌다.

const CHOICES: { v: HarvestVote; label: string; hint: string }[] = [
  { v: "onTime", label: "제때 왔어요", hint: "" },
  { v: "late", label: "늦었어요", hint: "" },
  { v: "noShow", label: "안 왔어요", hint: "말없이" },
];

export default function HarvestCard({
  promiseId,
  onSettled,
}: {
  promiseId: string;
  /** 정산이 끝났을 때. 부모가 내 당도를 다시 읽어간다. */
  onSettled?: () => void;
}) {
  const [state, setState] = useState<HarvestState | null>(null);
  const [votes, setVotes] = useState<Record<string, HarvestVote>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { harvest } = await fetchHarvest(promiseId);
      setState(harvest);
      if (harvest.settlement) onSettled?.();
    } catch {
      // 수확은 부수적인 칸이라, 못 읽으면 조용히 안 그린다. 플랜 자체를
      // 못 보게 만들 이유가 없다.
      setState(null);
    }
  }, [promiseId, onSettled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;
  if (state.window === "none" || state.window === "waiting") return null;
  if (state.eligibleCount < 2) return null;

  // ------------------------------------------------------------ 결과

  if (state.settlement) {
    const mine = state.mine;
    return (
      <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
        <p className="mb-3 tk-label text-[var(--tk-faint)]">수확 결과</p>

        {mine && (
          <div className="mb-3 flex items-center gap-3.5 rounded-xl bg-[var(--tk-ground)] p-3.5">
            <AppleGauge
              brix={13}
              size={64}
              poison={mine.poison}
              poisonDaysLeft={90}
              label={mine.poison ? "독사과" : "사과"}
              className="shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[var(--tk-ink)]">{resultLine(mine)}</p>
              <p className="tk-caption mt-0.5 text-[var(--tk-sub)]">
                내 당도 {formatDelta(mine.delta)}
                {mine.poison && " · 독사과 1개"}
              </p>
            </div>
          </div>
        )}

        <ul className="mb-2">
          {state.settlement.results.map((r) => (
            <li
              key={r.uid}
              className="flex items-center gap-2 border-b border-[var(--tk-line)] py-2.5 last:border-0"
            >
              {r.poison ? (
                <UserX className="size-4 shrink-0 text-[var(--ap-bruise)]" />
              ) : r.delta > 0 ? (
                <Apple className="size-4 shrink-0 text-[var(--ap-red)]" />
              ) : (
                <Sprout className="size-4 shrink-0 text-[var(--tk-faint)]" />
              )}
              <span className="tk-meta min-w-0 flex-1 truncate font-medium text-[var(--tk-ink)]">
                {r.name}
              </span>
              <span className="tk-caption shrink-0 text-[var(--tk-faint)]">{resultLine(r)}</span>
              <span
                className={`tk-caption w-9 shrink-0 text-right font-bold ${
                  r.delta < 0
                    ? "text-[var(--ap-bruise)]"
                    : r.delta > 0
                      ? "text-[var(--ap-red)]"
                      : "text-[var(--tk-faint)]"
                }`}
              >
                {formatDelta(r.delta)}
              </span>
            </li>
          ))}
        </ul>

        {/* 누가 어떻게 찍었는지는 끝까지 안 보여준다. 보이면 보복이 생기고,
            보복이 생기면 다음부터 아무도 사실대로 안 찍는다. */}
        <p className="tk-caption text-[var(--tk-assistive)]">
          {state.settlement.eligible}명 중 {state.settlement.voted}명이 냈어요 · 누가 어떻게
          평가했는지는 아무에게도 보이지 않아요
        </p>
      </section>
    );
  }

  // ------------------------------------------------------------ 표를 냈고, 기다리는 중

  if (state.submitted || !state.eligible) {
    return (
      <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
        <p className="mb-1 tk-label text-[var(--tk-faint)]">수확</p>
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--tk-ink)]">
          <Clock className="size-4 shrink-0 text-[var(--tk-faint)]" />
          {state.submitted ? "표를 냈어요" : "이 플랜은 평가하지 않아요"}
        </p>
        <p className="tk-caption mt-1 text-[var(--tk-sub)]">
          {state.submitted
            ? `${progressLine(state.votedCount, state.eligibleCount)} · 모두 내면 결과가 나와요`
            : "못 간다고 하신 플랜이라 평가에서 빠져요."}
        </p>
      </section>
    );
  }

  // ------------------------------------------------------------ 평가하기

  const targets = state.subjects.filter((s) => s.uid !== state.meUid);
  const done = targets.every((s) => votes[s.uid]);

  const send = async () => {
    if (busy || !done) return;
    setBusy(true);
    setError(null);
    try {
      const { harvest } = await submitHarvest(promiseId, votes);
      setState(harvest);
      if (harvest.settlement) onSettled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 tk-label text-[var(--tk-faint)]">수확</p>
      <p className="text-[14px] font-bold text-[var(--tk-ink)]">이번 플랜, 어땠나요?</p>
      <p className="tk-caption mb-3 mt-0.5 text-[var(--tk-sub)]">
        모두 내면 한 번에 열려요. 누가 어떻게 골랐는지는 아무에게도 보이지 않아요.
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      <ul className="mb-3">
        {targets.map((s) => (
          <li key={s.uid} className="border-b border-[var(--tk-line)] py-2.5 last:border-0">
            <p className="tk-meta mb-1.5 font-medium text-[var(--tk-ink)]">{s.name}</p>
            <div className="flex gap-1.5">
              {CHOICES.map((c) => {
                const on = votes[s.uid] === c.v;
                return (
                  <button
                    key={c.v}
                    type="button"
                    onClick={() => setVotes((v) => ({ ...v, [s.uid]: c.v }))}
                    aria-pressed={on}
                    className={`tk-caption h-9 flex-1 rounded-lg font-bold transition ${
                      on
                        ? c.v === "onTime"
                          ? "bg-[var(--ap-red)] text-white"
                          : "bg-[var(--ap-bruise)] text-white"
                        : "bg-[var(--tk-ground)] text-[var(--tk-sub)] hover:brightness-95"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={send}
        disabled={!done || busy}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl
          bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
          transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {done ? "표 내기" : "모두 골라주세요"}
      </button>

      {/* 한 번 내면 못 바꾸는 것은 미리 말해줘야 한다. 누르고 나서 알면 화가 난다. */}
      <p className="tk-caption mt-2 text-center text-[var(--tk-assistive)]">
        한 번 내면 바꿀 수 없어요 · {progressLine(state.votedCount, state.eligibleCount)}
      </p>
    </section>
  );
}
