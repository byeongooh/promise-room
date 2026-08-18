"use client";

import { CalendarDays, MapPin, Star } from "lucide-react";

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
  favorited = false,
  onToggleFavorite,
}: {
  promise: PromiseData & { id: string };
  onOpen: (id: string) => void;
  /** 예시 티켓. 진짜 약속이 아니므로 누를 수 없고, 예시라고 표시한다. */
  example?: boolean;
  favorited?: boolean;
  /** 넘기면 별 버튼이 뜬다. 안 넘기면(관리자·예시 화면) 아예 안 그린다 —
   *  거기서는 즐겨찾기를 켜고 끌 이유가 없다. */
  onToggleFavorite?: () => void;
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
    // 별 버튼은 티켓을 여는 큰 버튼 "밖"에 얹는다. <button> 안에 또 <button>을
    // 두면 안 되기 때문에(중첩 인터랙티브 요소는 잘못된 마크업이고, 클릭이
    // 부모로도 같이 새서 별을 눌러도 상세 화면이 같이 열린다), 같은 자리를
    // 절대 위치로 겹쳐 놓는 형제 버튼으로 뺐다.
    <div className="relative">
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

      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-pressed={favorited}
          aria-label={favorited ? "즐겨찾기 해제" : "즐겨찾기"}
          className="absolute right-[5.5rem] top-2 grid size-8 place-items-center
            rounded-full transition hover:bg-[var(--tk-ground)]"
        >
          <Star
            className={`size-[18px] transition ${
              favorited
                ? "fill-[var(--ap-red)] text-[var(--ap-red)]"
                : "fill-none text-[var(--tk-assistive)]"
            }`}
          />
        </button>
      )}
    </div>
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
