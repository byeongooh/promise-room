"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Loader2, Plus, X } from "lucide-react";

import { APPLE_BODY, APPLE_STEM, APPLE_VIEWBOX } from "@/lib/apple-shape";
import { formatDayLabel } from "@/lib/calendar";
import { displayWhere } from "@/lib/meeting-mode";
import { getCountdown, getPromiseDate } from "@/lib/promise-time";
import type { CalendarNote, PromiseData } from "@/lib/types";

// 고른 날 하나. 그날의 약속과 메모를 한 자리에 편다.
//
// **약속 줄에 약속 시각이 아니라 "몇 시에 나가야 하는지"를 같이 둔다.**
// 이 화면이 이겨야 하는 상대는 폰에 이미 깔린 기본 캘린더인데, 그쪽은
// "9시 해운대"까지만 알고 "4시 15분에 나가야 한다"는 모른다. 이 한 줄이
// 없으면 굳이 여기서 볼 이유가 없다.

function clock(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function duration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function PlanRow({ plan, leaveAt }: { plan: PromiseData; leaveAt: string | null }) {
  const at = getPromiseDate(plan);
  const leave = leaveAt ? new Date(leaveAt) : null;
  const leaveOk = leave && !Number.isNaN(leave.getTime()) && at;
  const travelSec = leaveOk ? Math.round((at.getTime() - leave.getTime()) / 1000) : 0;
  const late = leaveOk ? leave.getTime() < Date.now() : false;

  return (
    <Link
      href={`/promise/${plan.id}`}
      className="mb-1.5 block rounded-2xl bg-[var(--tk-paper)] p-3.5 shadow-sm ring-1 ring-black/5
        transition hover:brightness-[0.98]"
    >
      <div className="flex items-start gap-2.5">
        <svg width="20" height="22" viewBox={APPLE_VIEWBOX} aria-hidden="true" className="mt-0.5 shrink-0">
          <path d={APPLE_BODY} fill="var(--ap-red)" />
          <path d={APPLE_STEM} fill="none" stroke="var(--ap-leaf)" strokeWidth={10} strokeLinecap="round" />
        </svg>

        <span className="min-w-0 flex-1">
          <span className="tk-title block truncate text-[var(--tk-ink)]">{plan.title}</span>
          <span className="tk-meta mt-0.5 block truncate text-[var(--tk-faint)]">
            {at ? clock(at) : "시각 미정"} · {displayWhere(plan)}
            {(plan.participantIds?.length ?? 0) > 0 && ` · ${plan.participantIds!.length}명`}
          </span>
        </span>

        <ChevronRight className="mt-1 size-4 shrink-0 text-[var(--tk-assistive)]" />
      </div>

      {/* 출발 시각 — 이 달력의 존재 이유. 경로를 아직 안 골랐으면 알 수 없다. */}
      {leaveOk ? (
        <div className="mt-3 rounded-[10px] bg-[var(--ap-red-weak)] px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0 text-[var(--ap-red)]" />
            <span className="text-[14px] font-bold tracking-[-0.01em] text-[var(--ap-red)]">
              {clock(leave)}에 나가야 해요
              {late && " (지났음)"}
            </span>
          </div>
          {travelSec > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--ap-red)]" />
              <span className="h-0.5 flex-1 rounded-full bg-[var(--ap-red-line)]" />
              <span className="tk-caption whitespace-nowrap text-[var(--ap-red)]">
                {duration(travelSec)}
              </span>
              <span className="h-0.5 flex-1 rounded-full bg-[var(--ap-red-line)]" />
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--ap-red)]" />
            </div>
          )}
        </div>
      ) : (
        <p className="tk-caption mt-2.5 text-[var(--tk-assistive)]">
          경로를 정하면 몇 시에 나가야 하는지 알려드려요
        </p>
      )}
    </Link>
  );
}

export default function CalendarDay({
  dayKey,
  plans,
  leaveAtByPlan,
  notes,
  onAddNote,
  onRemoveNote,
}: {
  dayKey: string;
  plans: PromiseData[];
  /** promiseId → 내 출발 시각(ISO). 경로를 안 골랐으면 없다. */
  leaveAtByPlan: Record<string, string | null>;
  notes: CalendarNote[];
  onAddNote: (text: string) => Promise<void>;
  onRemoveNote: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countdown = plans.length > 0 ? getCountdown(getPromiseDate(plans[0])) : null;

  const submit = async () => {
    const body = text.trim();
    if (!body || adding) return;
    setAdding(true);
    setError(null);
    try {
      await onAddNote(body);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모를 저장하지 못했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const drop = async (id: string) => {
    if (removing) return;
    setRemoving(id);
    setError(null);
    try {
      await onRemoveNote(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모를 지우지 못했습니다.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="tk-meta font-bold text-[var(--tk-ink)]">{formatDayLabel(dayKey)}</span>
        {countdown && (
          <span className="tk-caption text-[var(--tk-faint)]">{countdown.badge}</span>
        )}
      </div>

      {plans.map((p) => (
        <PlanRow key={p.id} plan={p} leaveAt={leaveAtByPlan[p.id ?? ""] ?? null} />
      ))}

      {notes.map((n) => (
        <div
          key={n.id}
          className="mb-1.5 flex items-center gap-2.5 rounded-2xl bg-[var(--tk-paper)] px-3.5 py-3
            shadow-sm ring-1 ring-black/5"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--tk-assistive)]" />
          <span className="tk-meta min-w-0 flex-1 break-words text-[var(--tk-sub)]">{n.text}</span>
          <button
            type="button"
            onClick={() => drop(n.id)}
            disabled={removing !== null}
            aria-label="메모 지우기"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--tk-assistive)]
              transition hover:bg-[var(--tk-ground)] hover:text-[var(--tk-sub)] disabled:opacity-50"
          >
            {removing === n.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        </div>
      ))}

      {error && <p className="tk-caption mb-2 px-1 text-[var(--tk-warn)]">{error}</p>}

      {/* 메모 입력. 적는 게 원래 귀찮은 일이라 화면을 옮기지 않고 여기서 끝낸다. */}
      <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--tk-paper)] px-3 py-2
        shadow-sm ring-1 ring-black/5">
        <Plus className="size-4 shrink-0 text-[var(--tk-assistive)]" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          maxLength={200}
          placeholder="이 날에 메모 남기기"
          aria-label="메모 내용"
          className="tk-meta h-9 min-w-0 flex-1 bg-transparent text-[var(--tk-ink)] outline-none
            placeholder:text-[var(--tk-assistive)]"
        />
        {text.trim() && (
          <button
            type="button"
            onClick={submit}
            disabled={adding}
            className="tk-caption h-8 shrink-0 rounded-lg bg-[var(--tk-ink)] px-3 font-bold
              text-[var(--tk-paper)] transition hover:brightness-110 disabled:opacity-60"
          >
            {adding ? <Loader2 className="size-3.5 animate-spin" /> : "저장"}
          </button>
        )}
      </div>
    </section>
  );
}
