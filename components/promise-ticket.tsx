"use client";

import { CalendarDays, MapPin } from "lucide-react";

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
  example = false,
}: {
  promise: PromiseData & { id: string };
  onOpen: (id: string) => void;
  /** 예시 티켓. 진짜 약속이 아니므로 누를 수 없고, 예시라고 표시한다. */
  example?: boolean;
}) {
  const when = getPromiseDate(promise);
  const countdown = getCountdown(when);
  const stub = STUB_STYLE[countdown.tone];
  const names = getParticipantNames(promise);
  const isPast = countdown.tone === "past";

  const shell = `grid w-full grid-cols-[minmax(0,1fr)_5.25rem] overflow-hidden rounded-xl
    bg-[var(--tk-paper)] text-left shadow-sm ring-1 ring-black/5 ${isPast ? "opacity-65" : ""}`;

  // 예시는 열 상세 화면이 없다. 버튼으로 두면 눌러보고 아무 일도 안 일어난다.
  if (example) {
    return (
      <div className={`${shell} relative`} aria-label="예시 플랜">
        <span
          className="absolute right-[5.75rem] top-2.5 rounded-full bg-[var(--tk-ground)]
            px-2 py-0.5 tk-caption font-bold text-[var(--tk-faint)]"
        >
          예시
        </span>
        <TicketFace
          promise={promise}
          when={when}
          names={names}
          countdown={countdown}
          stub={stub}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(promise.id)}
      className={`group ${shell} transition hover:shadow-md focus-visible:outline-2
        focus-visible:outline-offset-2 focus-visible:outline-[var(--tk-ink)]`}
    >
      <TicketFace
        promise={promise}
        when={when}
        names={names}
        countdown={countdown}
        stub={stub}
      />
    </button>
  );
}

/** 티켓 안쪽. 누를 수 있는 티켓과 예시 티켓이 같은 얼굴을 쓰도록 떼어냈다. */
function TicketFace({
  promise,
  when,
  names,
  countdown,
  stub,
}: {
  promise: PromiseData & { id: string };
  when: Date | null;
  names: string[];
  countdown: ReturnType<typeof getCountdown>;
  stub: (typeof STUB_STYLE)[Tone];
}) {
  return (
    <>
      {/* 티켓 본문 */}
      <div className="min-w-0 p-4 sm:p-[18px]">
        <h3 className="tk-title truncate text-[var(--tk-ink)]">
          {promise.title || "(제목 없음)"}
        </h3>

        <div className="mt-2 space-y-0.5 text-[var(--tk-sub)]">
          <p className="tk-meta flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0 opacity-60" />
            <span className="truncate">{formatWhen(when)}</span>
          </p>
          <p className="tk-meta flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 opacity-60" />
            <span className="truncate">{displayLocation(promise.location)}</span>
          </p>
        </div>

        <div className="mt-3 flex items-center">
          <div className="flex">
            {names.slice(0, 4).map((n, i) => (
              <span
                key={`${n}-${i}`}
                title={n}
                className="-mr-1.5 grid size-[22px] place-items-center rounded-full
                  border-[1.5px] border-[var(--tk-paper)] bg-[var(--tk-ground)]
                  text-[11px] font-bold text-[var(--tk-ink)]"
              >
                {initial(n)}
              </span>
            ))}
          </div>
          <span className="tk-caption ml-3 text-[var(--tk-faint)]">
            {names.length > 0 ? `${names.length}명 참여` : "참여자 없음"}
          </span>
        </div>
      </div>

      {/* 절취선 + 스텁 */}
      <div
        className={`flex flex-col items-center justify-center gap-1
          border-l-2 border-dashed border-[var(--tk-line)] ${stub.box}`}
      >
        <span className={`tk-dday ${stub.badge}`}>{countdown.badge}</span>
        <span className={`tk-dday-sub ${stub.detail}`}>{countdown.detail}</span>
      </div>
    </>
  );
}
