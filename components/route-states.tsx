"use client";

import { Check, Circle, Crosshair, ExternalLink, Loader2, Train } from "lucide-react";

// 경로를 찾는 동안과 못 찾았을 때의 화면.
//
// 길찾기는 바깥 서비스에서 받아온다. 1~3초 걸리고 때로는 아무것도 못 찾는다.
// 지금까지 이 네 가지 상태(위치 확인 중 / 찾는 중 / 결과 / 못 찾음)가 전부
// 회색 글씨 한 줄이었는데, 사용자가 앱을 기다리는 시간의 대부분이 여기라
// 체감 품질을 가장 크게 좌우한다. 그래서 정식 화면으로 그린다.

/** 기다리는 동안 — 결과가 들어올 자리를 미리 보여준다. */
export function RouteSkeleton({ step }: { step: 0 | 1 | 2 }) {
  const stages = ["출발지 확인", "대중교통 찾는 중", "자동차 찾는 중"];

  return (
    <div className="space-y-2.5">
      {/* 들어올 카드 자리 3장. 아래로 갈수록 흐리게 해서
          "더 있을 수도 있다"는 느낌만 준다. */}
      <ul className="space-y-1.5" aria-hidden="true">
        {[1, 0.8, 0.6].map((op, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl bg-[var(--tk-ground)] px-4 py-3.5"
            style={{ opacity: op }}
          >
            <span className="size-4 shrink-0 rounded-full bg-[var(--tk-line)]" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span
                className={`block h-3 rounded bg-[var(--tk-line)] ${i === 0 ? "ap-shimmer" : ""}`}
                style={{ width: i === 0 ? "42%" : i === 1 ? "36%" : "30%" }}
              />
              <span className="block h-2.5 w-3/5 rounded bg-[var(--tk-line)] opacity-60" />
            </span>
            <span className="h-5 w-12 shrink-0 rounded bg-[var(--tk-line)]" />
          </li>
        ))}
      </ul>

      {/* 지금 무엇을 하고 있는지 */}
      <ol className="space-y-1.5 rounded-xl bg-[var(--tk-ground)] px-4 py-3">
        {stages.map((s, i) => {
          const done = i < step;
          const now = i === step;
          return (
            <li key={s} className="tk-caption flex items-center gap-2 text-[var(--tk-faint)]">
              {done ? (
                <Check className="size-3.5 shrink-0 text-[var(--ap-red)]" />
              ) : now ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--ap-red)]" />
              ) : (
                <Circle className="size-3.5 shrink-0 opacity-40" />
              )}
              <span className={now ? "font-bold text-[var(--tk-sub)]" : ""}>{s}</span>
            </li>
          );
        })}
        <li className="tk-caption pt-0.5 text-[var(--tk-faint)] opacity-70">보통 1~3초 걸려요</li>
      </ol>
    </div>
  );
}

/** 못 찾았을 때 — 왜 그런지와 해볼 수 있는 것을 같이 준다. */
export function RouteFailed({
  destinationName,
  kakaoMapUrl,
  onRetry,
  onUseCurrent,
}: {
  destinationName: string;
  kakaoMapUrl: string;
  onRetry: () => void;
  onUseCurrent: () => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--tk-ground)] px-4 py-4">
      <p className="tk-meta font-bold text-[var(--tk-ink)]">길을 못 찾았어요</p>
      <p className="tk-caption mt-1 leading-relaxed text-[var(--tk-sub)]">
        출발지와 <b>{destinationName}</b>이(가) 너무 가깝거나, 심야라 다니는 차가 없을 때
        생깁니다. 잠깐 안 될 때도 있어요.
      </p>

      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={onRetry}
          className="tk-caption flex h-11 w-full items-center gap-2 rounded-[10px]
            bg-[var(--tk-paper)] px-3.5 text-left font-bold text-[var(--tk-ink)]
            ring-1 ring-[var(--tk-line)] transition hover:brightness-95"
        >
          <Train className="size-4 shrink-0 text-[var(--tk-faint)]" />
          다시 찾기
        </button>
        <button
          type="button"
          onClick={onUseCurrent}
          className="tk-caption flex h-11 w-full items-center gap-2 rounded-[10px]
            bg-[var(--tk-paper)] px-3.5 text-left font-bold text-[var(--tk-ink)]
            ring-1 ring-[var(--tk-line)] transition hover:brightness-95"
        >
          <Crosshair className="size-4 shrink-0 text-[var(--tk-faint)]" />
          지금 있는 곳에서 다시
        </button>
        <a
          href={kakaoMapUrl}
          target="_blank"
          rel="noreferrer"
          className="tk-caption flex h-11 w-full items-center gap-2 rounded-[10px]
            bg-[var(--tk-paper)] px-3.5 text-left font-bold text-[var(--tk-ink)]
            ring-1 ring-[var(--tk-line)] transition hover:brightness-95"
        >
          <ExternalLink className="size-4 shrink-0 text-[var(--tk-faint)]" />
          카카오맵에서 열기
        </a>
      </div>
    </div>
  );
}
