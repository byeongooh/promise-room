"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import AppleGauge from "@/components/apple-gauge";
import Wordmark from "@/components/wordmark";
import { BRIX_START } from "@/lib/brix";

// 첫인상.
//
// 예전엔 가짜 도시 지도 그림을 깔고 그 위에 로그인 뭉치를 얹었다(지도/티켓
// 두 안을 두고 고르는 중이었다). 축이 약속에서 사람(사과)으로 옮겨가면서
// 첫 화면이 말해야 할 것도 "어디서 만날지"가 아니라 "여기서 뭐가 자라는지"로
// 바뀌었다. 그래서 배경 그림과 전환 버튼을 통째로 걷어내고 사과만 남겼다.
//
// 게이지는 시작값(13.0)이다. 아직 아무것도 안 한 사람의 사과라 그게 맞다.

export default function LoginPage() {
  const [pending, setPending] = useState(false);

  return (
    <main className="flex min-h-screen flex-col justify-between bg-[var(--tk-ground)] px-5 pb-10 pt-16">
      {/* 사과 + 이름 */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <AppleGauge brix={BRIX_START} size={200} label="사과" />

        <h1 className="mt-9">
          <Wordmark size="lg" />
        </h1>

        <p className="mt-3 text-center text-[15px] leading-relaxed text-[var(--tk-sub)]">
          약속을 지킨 만큼
          <br />
          <b className="font-bold text-[var(--tk-ink)]">내 사과가 익어요</b>
        </p>
      </div>

      {/* 로그인 */}
      <div className="mx-auto w-full max-w-sm">
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
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px]
            bg-[#FEE500] text-[15px] font-bold text-[#191600] transition
            hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-[var(--tk-ink)] disabled:cursor-not-allowed disabled:opacity-60"
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

        <p className="tk-caption mt-4 text-center text-[var(--tk-faint)]">
          플랜에 참여한 사람만 그 플랜을 볼 수 있어요
        </p>

        {/* 테스트 관찰용 관리자 화면. 비밀번호가 따로 있어 눌러도 아무나 못 들어간다. */}
        <div className="mt-7 text-center">
          <Link
            href="/admin"
            className="text-[11px] text-[var(--tk-assistive)] underline-offset-4
              hover:text-[var(--tk-sub)] hover:underline"
          >
            관리자
          </Link>
        </div>
      </div>
    </main>
  );
}
