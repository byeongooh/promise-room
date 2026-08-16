"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Loader2 } from "lucide-react";

import Wordmark from "@/components/wordmark";

// 로그인 화면도 "입장권" 은유를 따른다.
// 아직 이름이 비어 있는 티켓 한 장을 보여주고, 로그인하면 내 이름이 채워지는 그림.

export default function LoginPage() {
  const [pending, setPending] = useState(false);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1>
            <Wordmark size="lg" />
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--tk-sub)]">
            친구들과의 약속을 한 장의 티켓으로
          </p>
        </div>

        {/* 미리보기 티켓 — 로그인 전이라 비어 있는 상태 */}
        <div
          aria-hidden="true"
          className="grid grid-cols-[minmax(0,1fr)_5.25rem] overflow-hidden rounded-xl
            bg-[var(--tk-paper)] shadow-sm ring-1 ring-black/5"
        >
          <div className="min-w-0 p-4">
            <div className="h-[15px] w-32 rounded bg-[var(--tk-ground)]" />
            <div className="mt-3 space-y-1.5 text-[12.5px] text-[var(--tk-faint)]">
              <p className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5 opacity-60" />
                <span className="h-[10px] w-28 rounded bg-[var(--tk-ground)]" />
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="size-3.5 opacity-60" />
                <span className="h-[10px] w-20 rounded bg-[var(--tk-ground)]" />
              </p>
            </div>
            <div className="mt-3 flex">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="-mr-1.5 size-[21px] rounded-full border-[1.5px]
                    border-[var(--tk-paper)] bg-[var(--tk-ground)]"
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-[var(--tk-line)]">
            <span className="text-[21px] font-extrabold leading-none tracking-tight text-[var(--tk-line)]">
              D-?
            </span>
            <span className="text-[10px] font-bold text-[var(--tk-line)]">준비 중</span>
          </div>
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
        <div className="mt-10 text-center">
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
