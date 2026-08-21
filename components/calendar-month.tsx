"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { APPLE_BODY, APPLE_STEM, APPLE_VIEWBOX } from "@/lib/apple-shape";
import { formatMonthLabel, type CalendarCell } from "@/lib/calendar";

// 달력 한 달. 그리는 일만 한다 — 어느 달인지, 어디를 골랐는지는 부모가 들고 있다.
//
// 칸 안에 넣는 것은 두 가지뿐이다. 사과(=약속)와 회색 점(=메모).
// 제목이나 시각을 칸에 욱여넣지 않는다. 46px 칸에 13px 글자를 두 줄 넣으면
// 어느 것도 안 읽히고, 이 달력은 훑어보는 곳이 아니라 눌러서 들어가는 입구다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function AppleDot({ dim }: { dim: boolean }) {
  return (
    <svg
      width="9"
      height="10"
      viewBox={APPLE_VIEWBOX}
      aria-hidden="true"
      className={dim ? "opacity-45" : undefined}
    >
      <path d={APPLE_BODY} fill="var(--ap-red)" />
      <path
        d={APPLE_STEM}
        fill="none"
        stroke="var(--ap-leaf)"
        strokeWidth={12}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function CalendarMonth({
  year,
  month,
  cells,
  planDays,
  noteDays,
  selected,
  onSelect,
  onShift,
  onToday,
}: {
  year: number;
  month: number;
  cells: CalendarCell[];
  /** 약속이 있는 날짜 열쇠 */
  planDays: Set<string>;
  /** 메모가 있는 날짜 열쇠 */
  noteDays: Set<string>;
  selected: string | null;
  onSelect: (key: string) => void;
  onShift: (by: number) => void;
  onToday: () => void;
}) {
  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="tk-display text-[var(--tk-ink)]">{formatMonthLabel(year, month)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onShift(-1)}
            aria-label="이전 달"
            className="grid size-9 place-items-center rounded-lg text-[var(--tk-faint)]
              transition hover:bg-[var(--tk-ground)] hover:text-[var(--tk-sub)]"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="tk-caption h-9 rounded-lg bg-[var(--tk-disable)] px-3 font-bold
              text-[var(--tk-sub)] transition hover:brightness-95"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => onShift(1)}
            aria-label="다음 달"
            className="grid size-9 place-items-center rounded-lg text-[var(--tk-faint)]
              transition hover:bg-[var(--tk-ground)] hover:text-[var(--tk-sub)]"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 pb-1.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`tk-caption text-center ${
              i === 0 ? "text-[var(--ap-red)]/55" : "text-[var(--tk-faint)]"
            }`}
          >
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) => {
          if (!c.key) return <span key={`b${i}`} className="h-11" />;

          const isSel = c.key === selected;
          const hasPlan = planDays.has(c.key);
          const hasNote = noteDays.has(c.key);

          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c.key!)}
              aria-pressed={isSel}
              aria-label={`${c.day}일${hasPlan ? ", 약속 있음" : ""}${hasNote ? ", 메모 있음" : ""}`}
              className={`flex h-11 flex-col items-center justify-center gap-[3px] rounded-[10px]
                transition ${
                  isSel
                    ? "bg-[var(--tk-ink)]"
                    : c.today
                      ? "ring-1 ring-inset ring-[var(--tk-line)] hover:bg-[var(--tk-ground)]"
                      : "hover:bg-[var(--tk-ground)]"
                }`}
            >
              <span
                className={`text-[13px] leading-none tabular-nums ${
                  isSel
                    ? "font-bold text-[var(--tk-paper)]"
                    : c.past
                      ? c.sunday
                        ? "text-[var(--ap-red)]/28"
                        : "text-[var(--tk-assistive)]"
                      : c.sunday
                        ? "text-[var(--ap-red)]/55"
                        : "text-[var(--tk-ink)]"
                }`}
              >
                {c.day}
              </span>

              {/* 표시는 두 가지뿐. 지난 날은 흐리게 — 달을 넘기면 지나온 약속이
                  얼마나 있었는지가 그대로 보인다. */}
              <span className="flex h-2 items-center gap-[3px]">
                {hasPlan && <AppleDot dim={c.past && !isSel} />}
                {hasNote && (
                  <span
                    className={`size-1 rounded-full ${
                      isSel ? "bg-[var(--tk-paper)]/55" : "bg-[var(--tk-assistive)]"
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
