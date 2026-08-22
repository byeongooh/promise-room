"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Clock, Loader2, X } from "lucide-react";

import NoteComposer from "@/components/note-composer";
import { APPLE_BODY, APPLE_STEM, APPLE_VIEWBOX } from "@/lib/apple-shape";
import { formatDayLabel, frequentTexts } from "@/lib/calendar";
import { displayWhere } from "@/lib/meeting-mode";
import { getCountdown, getPromiseDate } from "@/lib/promise-time";
import type { CalendarNote, PromiseData } from "@/lib/types";

// 고른 날 하나. 그날의 약속과 메모를 한 자리에 편다.
//
// **약속 줄에 약속 시각이 아니라 "몇 시에 나가야 하는지"를 같이 둔다.**
// 이 화면이 이겨야 하는 상대는 폰에 이미 깔린 기본 캘린더인데, 그쪽은
// "9시 해운대"까지만 알고 "4시 15분에 나가야 한다"는 모른다.
//
// 메모는 두 자리에 산다.
//   약속 안 — "챙길 것" 체크리스트. 약속을 보다가 그 자리에서 적는 게
//             제일 안 귀찮아서 기본 자리로 뒀다.
//   그날    — 약속에 딸리지 않은 메모. **약속이 하나도 없는 날에도 쓸 수 있어야
//             한다** — 달력을 여는 이유가 약속만은 아니다.

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

function NoteRow({
  note,
  checkable,
  onToggle,
  onRemove,
}: {
  note: CalendarNote;
  /** 약속에 딸린 것만 체크한다. 그날 메모는 챙길 것이 아니라 그냥 적어둔 것. */
  checkable: boolean;
  onToggle: (id: string, done: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"toggle" | "remove" | null>(null);
  const done = note.done === true;

  const run = async (kind: "toggle" | "remove", fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {checkable ? (
        <button
          type="button"
          onClick={() => run("toggle", () => onToggle(note.id, !done))}
          disabled={busy !== null}
          aria-pressed={done}
          aria-label={done ? "안 챙김으로 되돌리기" : "챙김으로 표시"}
          className={`grid size-[19px] shrink-0 place-items-center rounded-md transition ${
            done
              ? "bg-[var(--ap-leaf)]"
              : "ring-[1.5px] ring-inset ring-[var(--tk-line)] hover:ring-[var(--tk-faint)]"
          }`}
        >
          {busy === "toggle" ? (
            <Loader2 className="size-3 animate-spin text-[var(--tk-faint)]" />
          ) : done ? (
            <Check className="size-3 text-[var(--tk-paper)]" strokeWidth={3.5} />
          ) : null}
        </button>
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--tk-assistive)]" />
      )}

      <span
        className={`tk-meta min-w-0 flex-1 break-words ${
          done ? "text-[var(--tk-assistive)] line-through" : "text-[var(--tk-sub)]"
        }`}
      >
        {note.text}
      </span>

      <button
        type="button"
        onClick={() => run("remove", () => onRemove(note.id))}
        disabled={busy !== null}
        aria-label="메모 지우기"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--tk-assistive)]
          transition hover:bg-[var(--tk-ground)] hover:text-[var(--tk-sub)] disabled:opacity-50"
      >
        {busy === "remove" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </button>
    </div>
  );
}

function PlanCard({
  plan,
  leaveAt,
  notes,
  chips,
  onAdd,
  onToggle,
  onRemove,
}: {
  plan: PromiseData;
  leaveAt: string | null;
  notes: CalendarNote[];
  chips: string[];
  onAdd: (text: string) => Promise<void>;
  onToggle: (id: string, done: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const at = getPromiseDate(plan);
  const leave = leaveAt ? new Date(leaveAt) : null;
  const leaveOk = leave && !Number.isNaN(leave.getTime()) && at;
  const travelSec = leaveOk ? Math.round((at.getTime() - leave.getTime()) / 1000) : 0;
  const late = leaveOk ? leave.getTime() < Date.now() : false;

  return (
    <div className="mb-1.5 rounded-2xl bg-[var(--tk-paper)] p-3.5 shadow-sm ring-1 ring-black/5">
      {/* 카드 전체가 아니라 머리 줄만 링크다. 아래 체크박스를 누를 때 플랜으로
          넘어가버리면 안 된다. */}
      <Link href={`/promise/${plan.id}`} className="flex items-start gap-2.5">
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
      </Link>

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

      <div className="mt-3 border-t border-[var(--tk-line)] pt-3">
        <p className="mb-1 tk-label text-[var(--tk-faint)]">
          챙길 것
          {notes.length > 0 && (
            <span className="ml-1.5 font-normal tracking-normal text-[var(--tk-assistive)]">
              {notes.filter((n) => n.done).length} / {notes.length}
            </span>
          )}
        </p>

        {notes.map((n) => (
          <NoteRow key={n.id} note={n} checkable onToggle={onToggle} onRemove={onRemove} />
        ))}

        <div className={notes.length > 0 ? "mt-2" : "mt-1.5"}>
          <NoteComposer
            chips={chips}
            placeholder="챙길 것 추가"
            empty={notes.length === 0}
            onAdd={onAdd}
          />
        </div>
      </div>
    </div>
  );
}

export default function CalendarDay({
  dayKey,
  plans,
  leaveAtByPlan,
  notes,
  allNotes,
  onAddNote,
  onToggleNote,
  onRemoveNote,
}: {
  dayKey: string;
  plans: PromiseData[];
  /** promiseId → 내 출발 시각(ISO). 경로를 안 골랐으면 없다. */
  leaveAtByPlan: Record<string, string | null>;
  /** 이 날의 메모 전부 */
  notes: CalendarNote[];
  /** 칩을 뽑을 이력. 지금까지 쓴 메모 전부. */
  allNotes: CalendarNote[];
  onAddNote: (text: string, promiseId: string | null) => Promise<void>;
  onToggleNote: (id: string, done: boolean) => Promise<void>;
  onRemoveNote: (id: string) => Promise<void>;
}) {
  const countdown = plans.length > 0 ? getCountdown(getPromiseDate(plans[0])) : null;
  const dayNotes = notes.filter((n) => !n.promiseId);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="tk-meta font-bold text-[var(--tk-ink)]">{formatDayLabel(dayKey)}</span>
        {countdown && <span className="tk-caption text-[var(--tk-faint)]">{countdown.badge}</span>}
      </div>

      {plans.map((p) => {
        const mine = notes.filter((n) => n.promiseId === p.id);
        return (
          <PlanCard
            key={p.id}
            plan={p}
            leaveAt={leaveAtByPlan[p.id ?? ""] ?? null}
            notes={mine}
            chips={frequentTexts(allNotes, mine.map((n) => n.text))}
            onAdd={(text) => onAddNote(text, p.id ?? null)}
            onToggle={onToggleNote}
            onRemove={onRemoveNote}
          />
        );
      })}

      {/* 그날 메모. **약속이 하나도 없는 날에도 나온다** — 달력을 여는 이유가
          약속만은 아니고, 적을 자리가 없으면 이 화면은 반쪽이다. */}
      <div className="rounded-2xl bg-[var(--tk-paper)] p-3.5 shadow-sm ring-1 ring-black/5">
        <p className="mb-1 tk-label text-[var(--tk-faint)]">
          {plans.length > 0 ? "이 날 메모" : "메모"}
        </p>

        {dayNotes.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            checkable={false}
            onToggle={onToggleNote}
            onRemove={onRemoveNote}
          />
        ))}

        <div className={dayNotes.length > 0 ? "mt-2" : "mt-1.5"}>
          <NoteComposer
            chips={frequentTexts(allNotes, dayNotes.map((n) => n.text))}
            placeholder={plans.length > 0 ? "이 날에 메모 남기기" : "메모 남기기"}
            empty={dayNotes.length === 0 && plans.length === 0}
            onAdd={(text) => onAddNote(text, null)}
          />
        </div>
      </div>
    </section>
  );
}
