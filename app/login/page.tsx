"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import Wordmark from "@/components/wordmark";
import { CityMapBackground, TicketPatternBackground } from "@/components/login-background";

// 로그인 화면 배경은 두 안을 만들어 두고 고르는 중이다.
//   map     — 도시 지도. "어디서 만날지"를 먼저 말한다.
//   pattern — 흐린 티켓이 흩뿌려진 배경. 더 조용하다.
// 정하기 전까지는 ?bg=map / ?bg=pattern 으로 폰에서 바로 바꿔 볼 수 있게 둔다.
type Background = "map" | "pattern";
const DEFAULT_BACKGROUND: Background = "map";

const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: "map", label: "지도" },
  { value: "pattern", label: "티켓" },
];

// 부제는 배경과 상관없이 하나로 둔다.
// 앱이 뭘 해주는지 말하는 자리이지, 분위기를 잡는 자리가 아니다.
const TAGLINE = "약속을 위한 지도 티켓";

export default function LoginPage() {
  const [pending, setPending] = useState(false);
  const [background, setBackground] = useState<Background>(DEFAULT_BACKGROUND);

  // useSearchParams를 쓰면 이 페이지 전체를 Suspense로 감싸야 해서 직접 읽는다.
  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg");
    if (bg === "map" || bg === "pattern") setBackground(bg);
  }, []);

  return (
    // 배경이 보여야 하므로 로그인 뭉치는 화면 아래쪽에 모은다.
    <main
      className="relative flex min-h-screen flex-col justify-end overflow-hidden
        bg-[var(--tk-ground)] px-5 pb-10 pt-10"
    >
      {background === "map" ? <CityMapBackground /> : <TicketPatternBackground />}

      <div className="relative z-10 mx-auto w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1>
            <Wordmark size="lg" />
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--tk-sub)]">{TAGLINE}</p>
        </div>

        <button
          type="button"
          onClick={async () => {
            setPending(true);
            try {
              await signIn("kakao", { callbackUrl: "/" });
            } finally {
              setPending(false);
            }
          }}
          disabled={pending}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl
            bg-[#FEE500] px-4 py-3.5 text-[15px] font-bold text-[#191600]
            transition hover:brightness-95 focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-[var(--tk-ink)]
            disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              카카오로 이동 중…
            </>
          ) : (
            <>
              {/* 카카오 말풍선 심볼 */}
              <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 3C6.99 3 3 6.2 3 10.14c0 2.5 1.66 4.7 4.16 5.96-.18.63-.66 2.3-.76 2.66-.12.45.17.44.35.32.15-.1 2.3-1.56 3.23-2.2.66.1 1.34.15 2.02.15 5.01 0 9-3.2 9-7.14S17.01 3 12 3Z"
                />
              </svg>
              카카오로 시작하기
            </>
          )}
        </button>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-[var(--tk-faint)]">
          약속에 참여한 사람만 그 약속을 볼 수 있습니다.
        </p>

        {/* 테스트 관찰용 관리자 화면으로 가는 통로.
            비밀번호가 따로 있어 눌러도 아무나 들어갈 수 없다. */}
        {/* 배경 고르는 동안만 두는 임시 전환기. 정해지면 통째로 지운다. */}
        <div
          role="group"
          aria-label="배경 고르기"
          className="mx-auto mt-8 flex w-fit gap-1 rounded-full bg-[var(--tk-paper)]/70 p-1
            ring-1 ring-[var(--tk-line)] backdrop-blur-sm"
        >
          {BACKGROUNDS.map(({ value, label }) => {
            const on = background === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => setBackground(value)}
                className={`rounded-full px-3.5 py-1.5 text-[11.5px] transition ${
                  on
                    ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                    : "font-medium text-[var(--tk-sub)] hover:bg-[var(--tk-ground)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/admin"
            className="text-[11px] text-[var(--tk-faint)]/60 underline-offset-4 hover:text-[var(--tk-sub)] hover:underline"
          >
            관리자
          </Link>
        </div>
      </div>
    </main>
  );
}
