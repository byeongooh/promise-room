"use client";

import { useState } from "react";
import { CalendarDays, Check, Crown, Loader2, Plus, X } from "lucide-react";

import {
  addDateOption as apiAdd,
  confirmDate as apiConfirm,
  removeDateOption as apiRemove,
  voteDateOption as apiVote,
} from "@/lib/api-client";
import { dateVerdict, formatOption, rankOptions, tally, VOTE_LABEL } from "@/lib/date-vote";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { DateOption, DateVote } from "@/lib/types";

// 언제 만날지 맞추는 칸.
//
// 장소는 이동시간이라는 숫자로 줄을 세울 수 있지만 날짜는 그럴 수 없어서,
// 각자에게 물어보고 표를 모은다. "애매해요"를 굳이 남겨둔 이유는, 억지로
// 되냐/안 되냐로 가르면 사람들이 일단 "돼요"를 누르고 나중에 못 오기 때문이다.
//
// 정렬 규칙(lib/date-vote.ts)의 핵심: 못 오는 사람이 한 명이라도 있으면
// 표가 많아도 뒤로 민다. 모임은 참석률이 아니라 "그날 우리가 만나는가"다.

const VOTES: DateVote[] = ["ok", "maybe", "no"];

function VoteChip({
  vote,
  active,
  onClick,
  disabled,
}: {
  vote: DateVote;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const tone = active
    ? vote === "ok"
      ? "bg-[var(--ap-leaf)] text-white"
      : vote === "maybe"
        ? "bg-[var(--ap-honey)] text-white"
        : "bg-[var(--tk-assistive)] text-white"
    : "bg-[var(--tk-paper)] text-[var(--tk-sub)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 flex-1 rounded-[10px] text-[12.5px] font-bold transition
        disabled:opacity-60 ${tone}`}
    >
      {VOTE_LABEL[vote]}
    </button>
  );
}

export default function DateVoteBoard({
  promiseId,
  options,
  participantCount,
  isOwner,
  myUid,
  onChanged,
}: {
  promiseId: string;
  options: DateOption[];
  /** 표를 셀 때 "아직 답 안 한 사람"을 구하려면 전체 인원이 필요하다. */
  participantCount: number;
  isOwner: boolean;
  myUid?: string;
  onChanged?: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myKey = normalizeKakaoId(myUid);
  const ranked = rankOptions(options, participantCount);

  const add = async () => {
    if (!date || adding) return;
    setAdding(true);
    setError(null);
    try {
      await apiAdd(promiseId, { date, time });
      setDate("");
      setTime("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "후보를 올리지 못했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const vote = async (optionId: string, v: DateVote) => {
    if (busy) return;
    setBusy(optionId);
    setError(null);
    try {
      await apiVote(promiseId, optionId, v);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "답하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (o: DateOption) => {
    if (busy) return;
    if (!o.time) {
      setError("시간까지 정해야 확정할 수 있어요. 시간을 넣은 후보를 새로 올려주세요.");
      return;
    }
    setBusy(o.id);
    setError(null);
    try {
      await apiConfirm(promiseId, { date: o.date, time: o.time });
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "날짜를 정하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const drop = async (o: DateOption) => {
    if (busy) return;
    setBusy(o.id);
    setError(null);
    try {
      await apiRemove(promiseId, o.id);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "후보를 거두지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
        <CalendarDays className="size-3.5" />
        언제 만날까
      </p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        후보를 올리고 각자 답하면, 만든 사람이 보고 정해요.
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      {/* 후보 올리기 */}
      <div className="flex gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
            text-[var(--tk-ink)] outline-none"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-11 w-[104px] shrink-0 rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
            text-[var(--tk-ink)] outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!date || adding}
          aria-label="날짜 후보 올리기"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--tk-ink)]
            text-[var(--tk-paper)] transition hover:brightness-110 disabled:opacity-40"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>
      <p className="tk-caption mt-1.5 text-[var(--tk-assistive)]">
        시간은 비워도 돼요. 그날이 되는지부터 물어볼 수 있어요.
      </p>

      {/* 후보 목록 */}
      {ranked.length === 0 ? (
        <p className="tk-meta mt-3 rounded-xl bg-[var(--tk-ground)] px-4 py-3 text-[var(--tk-faint)]">
          아직 올라온 날짜가 없어요. 위에서 하나 올려보세요.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {ranked.map((o, i) => {
            const t = tally(o, participantCount);
            const say = dateVerdict(t, participantCount);
            const mine = o.votes.find((v) => myKey && normalizeKakaoId(v.uid) === myKey);
            const isMineOption = !!myKey && normalizeKakaoId(o.byUid) === myKey;
            const working = busy === o.id;

            return (
              <li
                key={o.id}
                className={`rounded-xl p-3.5 ${
                  i === 0 && say.tone === "best"
                    ? "bg-[var(--ap-leaf)]/10 ring-1 ring-[var(--ap-leaf)]/30"
                    : "bg-[var(--tk-ground)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="tk-title">{formatOption(o)}</p>
                    <p
                      className={`tk-caption mt-0.5 ${
                        say.tone === "best"
                          ? "font-bold text-[var(--ap-leaf)]"
                          : say.tone === "blocked"
                            ? "text-[var(--ap-red)]"
                            : "text-[var(--tk-faint)]"
                      }`}
                    >
                      {say.line}
                    </p>
                  </div>

                  {(isOwner || isMineOption) && (
                    <button
                      type="button"
                      onClick={() => drop(o)}
                      disabled={busy !== null}
                      aria-label="이 후보 거두기"
                      className="shrink-0 rounded-md p-1 text-[var(--tk-assistive)]
                        transition hover:text-[var(--tk-sub)] disabled:opacity-40"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* 표 현황 */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span className="tk-caption text-[var(--ap-leaf)]">돼요 {t.ok}</span>
                  {t.maybe > 0 && (
                    <span className="tk-caption text-[var(--ap-honey)]">애매 {t.maybe}</span>
                  )}
                  {t.no > 0 && <span className="tk-caption text-[var(--ap-red)]">안 돼요 {t.no}</span>}
                  {t.pending > 0 && (
                    <span className="tk-caption text-[var(--tk-assistive)]">미답 {t.pending}</span>
                  )}
                </div>

                {/* 누가 뭐라 했는지 — 이름이 보여야 조율이 된다 */}
                {o.votes.length > 0 && (
                  <p className="tk-caption mt-1.5 text-[var(--tk-assistive)]">
                    {o.votes
                      .map((v) => `${v.name} ${VOTE_LABEL[v.vote]}`)
                      .join(" · ")}
                  </p>
                )}

                {/* 내 답 */}
                <div className="mt-2.5 flex gap-1.5">
                  {VOTES.map((v) => (
                    <VoteChip
                      key={v}
                      vote={v}
                      active={mine?.vote === v}
                      disabled={busy !== null}
                      onClick={() => vote(o.id, v)}
                    />
                  ))}
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => confirm(o)}
                    disabled={busy !== null}
                    className="mt-2 flex h-11 w-full items-center justify-center gap-1.5
                      rounded-[10px] bg-[var(--tk-ink)] text-[13px] font-bold
                      text-[var(--tk-paper)] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {working ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Crown className="size-3.5" />
                    )}
                    이 날짜로 정하기
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isOwner && ranked.length > 0 && (
        <p className="tk-caption mt-2.5 flex items-center gap-1.5 text-[var(--tk-assistive)]">
          <Check className="size-3.5 shrink-0" />
          날짜를 확정하는 건 플랜 만든 사람만 할 수 있어요
        </p>
      )}
    </section>
  );
}
