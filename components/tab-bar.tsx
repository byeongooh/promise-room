"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus } from "lucide-react";

// 하단 탭바 — 홈 / 새 플랜 / 내 사과.
//
// 예전에는 헤더에 "새 약속"과 "로그아웃" 버튼이 나란히 있었다. 축이 사람으로
// 옮겨가면서 "내 사과"가 상시 갈 수 있는 자리여야 해서 아래로 내렸고,
// 새 플랜은 가운데 큰 버튼으로 뺐다. 한 손으로 쓰는 화면이라 자주 누르는
// 것일수록 엄지가 닿는 아래쪽에 있어야 한다.

/** 사과 실루엣. AppleGauge와 같은 path를 선으로만 쓴다. */
function AppleIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="22" viewBox="0 0 100 112" aria-hidden="true">
      <path
        d="M50 38C38 24 14 30 14 55c0 24 22 45 36 45s36-21 36-45C86 30 62 24 50 38Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 9}
      />
      <path
        d="M50 38c1-11 7-17 17-19"
        fill="none"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TabBar() {
  const path = usePathname();
  const onHome = path === "/";
  const onMe = path?.startsWith("/me") ?? false;

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-2 transition ${
      active ? "text-[var(--ap-red)]" : "text-[var(--tk-faint)]"
    }`;

  return (
    // 고정 바라서 본문 아래에 같은 높이만큼 여백을 줘야 마지막 카드가 가리지 않는다.
    // 그 여백은 각 화면에서 pb-24 로 준다.
    <nav
      aria-label="주요 화면"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--tk-line)]
        bg-[var(--tk-paper)]/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-center px-6">
        <Link href="/" className={item(onHome)} aria-current={onHome ? "page" : undefined}>
          <Home className="size-5" />
          <span className="text-[10.5px] font-bold">홈</span>
        </Link>

        {/* 새 플랜 — 가장 자주 누르는 것이라 가운데 큰 버튼으로 */}
        <div className="flex w-20 shrink-0 justify-center">
          <Link
            href="/create"
            aria-label="새 플랜 만들기"
            className="grid size-14 -translate-y-3 place-items-center rounded-full
              bg-[var(--tk-ink)] text-[var(--tk-paper)] shadow-lg transition
              hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[var(--ap-red)]"
          >
            <Plus className="size-6" />
          </Link>
        </div>

        <Link href="/me" className={item(onMe)} aria-current={onMe ? "page" : undefined}>
          <AppleIcon filled={onMe} />
          <span className="text-[10.5px] font-bold">내 사과</span>
        </Link>
      </div>
    </nav>
  );
}
