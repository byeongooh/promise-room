"use client";

import { CalendarDays, MapPin, TriangleAlert } from "lucide-react";

import type { PromiseData } from "@/lib/types";
import { getParticipantNames } from "@/lib/promise-permissions";
import {
  displayLocation,
  formatWhen,
  getCountdown,
  getPromiseDate,
  type Tone,
} from "@/lib/promise-time";

// 약속 하나를 입장권처럼 보여준다.
// 오른쪽 절취선 뒤 스텁에 남은 날짜가 들어가고, 임박할수록 색이 진해진다.

const STUB_STYLE: Record<Tone, { box: string; badge: string; detail: string }> = {
  now: {
    box: "bg-[var(--tk-now-bg)] border-[var(--tk-now-ink)]/25",
    badge: "text-[var(--tk-now-ink)]",
    detail: "text-[var(--tk-now-ink)]/75",
  },
  soon: {
    box: "bg-[var(--tk-hot-bg)] border-[var(--tk-hot-ink)]/25",
    badge: "text-[var(--tk-hot-ink)]",
    detail: "text-[var(--tk-hot-ink)]/75",
  },
  later: {
    box: "bg-[var(--tk-paper)]",
    badge: "text-[var(--tk-ink)]",
    detail: "text-[var(--tk-faint)]",
  },
  past: {
    box: "bg-[var(--tk-paper)]",
    badge: "text-[var(--tk-faint)]",
    detail: "text-[var(--tk-faint)]",
  },
};

function initial(name: string): string {
  return name.trim().charAt(0) || "?";
}

export default function PromiseTicket({
  promise,
  onOpen,
}: {
  promise: PromiseData & { id: string };
  onOpen: (id: string) => void;
}) {
  const when = getPromiseDate(promise);
  const countdown = getCountdown(when);
  const stub = STUB_STYLE[countdown.tone];
  const names = getParticipantNames(promise);
  const isPast = countdown.tone === "past";

  return (
    <button
      type="button"
      onClick={() => onOpen(promise.id)}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_5.25rem] overflow-hidden rounded-xl
        bg-[var(--tk-paper)] text-left shadow-sm ring-1 ring-black/5 transition
        hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-[var(--tk-ink)] ${isPast ? "opacity-65" : ""}`}
    >
      {/* 티켓 본문 */}
      <div className="min-w-0 p-4">
        <h3 className="truncate text-[15.5px] font-bold tracking-tight text-[var(--tk-ink)]">
          {promise.title || "(제목 없음)"}
        </h3>

        <div className="mt-2 space-y-1 text-[12.5px] text-[var(--tk-sub)]">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{formatWhen(when)}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{displayLocation(promise.location)}</span>
          </p>
        </div>

        {promise.penalty?.trim() ? (
          <p className="mt-2 flex items-center gap-1.5 border-t border-dashed border-[var(--tk-line)]/70 pt-2 text-[11.5px] text-[var(--tk-warn)]">
            <TriangleAlert className="size-3 shrink-0" />
            <span className="truncate">지각 시 · {promise.penalty}</span>
          </p>
        ) : null}

        <div className="mt-2.5 flex items-center">
          <div className="flex">
            {names.slice(0, 4).map((n, i) => (
              <span
                key={`${n}-${i}`}
                title={n}
                className="-mr-1.5 grid size-[21px] place-items-center rounded-full
                  border-[1.5px] border-[var(--tk-paper)] bg-[var(--tk-ground)]
                  text-[10.5px] font-bold text-[var(--tk-ink)]"
              >
                {initial(n)}
              </span>
            ))}
          </div>
          <span className="ml-3 text-[11.5px] text-[var(--tk-faint)]">
            {names.length > 0 ? `${names.length}명 참여` : "참여자 없음"}
          </span>
        </div>
      </div>

      {/* 절취선 + 스텁 */}
      <div
        className={`flex flex-col items-center justify-center gap-0.5
          border-l-2 border-dashed border-[var(--tk-line)] ${stub.box}`}
      >
        <span
          className={`text-[21px] font-extrabold leading-none tracking-tight tabular-nums ${stub.badge}`}
        >
          {countdown.badge}
        </span>
        <span className={`text-[10px] font-bold tracking-wide ${stub.detail}`}>
          {countdown.detail}
        </span>
      </div>
    </button>
  );
}
