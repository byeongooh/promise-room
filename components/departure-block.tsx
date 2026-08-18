"use client";

import { Car, TrainFront } from "lucide-react";

import type { MemberRoute } from "@/lib/types";

// "몇 시에 나가야 하나" — 이 앱이 실제로 파는 값.
//
// 서버가 경로를 저장할 때 이미 계산해 둔 값인데(약속시각 − 소요시간),
// 지금까지는 참여자 목록 안 작은 글씨 한 줄에 묻혀 있었다. 그걸 화면
// 주인공으로 올리는 것이 핸드오프 가설 3의 핵심이다.
//
// 잉크 배경 + 종이 글자를 쓰는 이유: 이 화면에서 색을 가진 카드는 여기
// 하나뿐이어야 눈이 먼저 온다. 사과 빨강은 당도 전용이라 쓰지 않는다.

function formatClock(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function formatSpan(sec: number): string {
  const min = Math.max(0, Math.round(sec / 60));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export default function DepartureBlock({
  leaveAt,
  route,
  onChange,
}: {
  /** ISO 문자열. 서버가 경로 저장 시 계산해 둔다. */
  leaveAt: string | null;
  route: MemberRoute | null;
  /** "바꾸기" — 아래 경로 고르는 칸으로 보낸다. */
  onChange?: () => void;
}) {
  // 경로를 아직 안 골랐으면 값이 없다. 빈 카드를 그리는 대신 무엇을 하면
  // 되는지 한 줄로 말한다.
  if (!leaveAt || !route) {
    return (
      <section
        className="mb-3 rounded-xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-[var(--tk-line)]"
      >
        <p className="tk-label text-[var(--tk-faint)]">나가야 하는 시각</p>
        <p className="tk-body mt-1.5 text-[var(--tk-sub)]">
          아래에서 출발지를 정하면 <b className="text-[var(--tk-ink)]">몇 시에 나가야 하는지</b>{" "}
          알려드려요.
        </p>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="mt-3 h-11 w-full rounded-[10px] bg-[var(--tk-ink)] text-[13px]
              font-bold text-[var(--tk-paper)] transition hover:brightness-110"
          >
            출발지 정하기
          </button>
        )}
      </section>
    );
  }

  const when = new Date(leaveAt);
  const valid = !Number.isNaN(when.getTime());
  const diffMs = valid ? when.getTime() - Date.now() : 0;
  const past = diffMs < 0;

  return (
    <section
      className="mb-3 overflow-hidden rounded-xl bg-[var(--tk-ink)] text-[var(--tk-paper)] shadow-sm"
    >
      <div className="px-4 pb-4 pt-3.5">
        <p className="tk-label opacity-65">나가야 하는 시각</p>

        <p className="mt-1 text-[38px] font-extrabold leading-none tracking-tight tabular-nums">
          {valid ? formatClock(when) : "—"}
        </p>

        <p className="tk-caption mt-2 opacity-75">
          {formatSpan(route.durationSec)} 걸려요
          {valid && (past ? " · 출발 시각이 지났어요" : ` · 지금부터 ${formatSpan(diffMs / 1000)} 뒤`)}
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--tk-paper)]/15 px-4 py-3">
        <span className="shrink-0 opacity-70">
          {route.kind === "car" ? (
            <Car className="size-4" />
          ) : (
            <TrainFront className="size-4" />
          )}
        </span>
        <span className="tk-caption min-w-0 flex-1 truncate opacity-85">
          {route.origin?.label ? `${route.origin.label}에서 출발` : "출발지"} · {route.label}
        </span>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="tk-caption shrink-0 rounded-md px-2 py-1 font-bold underline-offset-2
              opacity-85 transition hover:opacity-100 hover:underline"
          >
            바꾸기
          </button>
        )}
      </div>
    </section>
  );
}
