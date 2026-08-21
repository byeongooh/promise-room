"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Plus } from "lucide-react";

import { APPLE_BODY, APPLE_STEM, APPLE_VIEWBOX, stemWidth } from "@/lib/apple-shape";

// 하단 탭바 — 홈 / 달력 / 새 플랜 / 내 사과.
//
// 예전에는 헤더에 "새 약속"과 "로그아웃" 버튼이 나란히 있었다. 축이 사람으로
// 옮겨가면서 "내 사과"가 상시 갈 수 있는 자리여야 해서 아래로 내렸고,
// 새 플랜은 가운데 큰 버튼으로 뺐다. 한 손으로 쓰는 화면이라 자주 누르는
// 것일수록 엄지가 닿는 아래쪽에 있어야 한다.

/**
 * 사과 실루엣. 몸통은 lib/apple-shape.ts에서 가져와 워드마크·AppleGauge와
 * 같은 모양을 쓴다.
 *
 * 광(APPLE_SHINE)만 뺐다. 여기는 currentColor 단색 20px이라, 흰 광을 얹으면
 * 채운 상태에서는 구멍처럼 보이고 선 상태에서는 아예 안 보인다.
 */
function AppleIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="22" viewBox={APPLE_VIEWBOX} aria-hidden="true">
      <path
        d={APPLE_BODY}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 9}
        strokeLinejoin="round"
      />
      <path
        d={APPLE_STEM}
        fill="none"
        stroke="currentColor"
        strokeWidth={stemWidth(20)}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TabBar() {
  const path = usePathname();
  const onHome = path === "/";
  const onMe = path?.startsWith("/me") ?? false;
  const onCalendar = path?.startsWith("/calendar") ?? false;

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

        <Link
          href="/calendar"
          className={item(onCalendar)}
          aria-current={onCalendar ? "page" : undefined}
        >
          <CalendarDays className="size-5" />
          <span className="text-[10.5px] font-bold">달력</span>
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

        {/* 왼쪽이 둘, 오른쪽이 하나라 그대로 두면 가운데 버튼이 오른쪽으로 밀린다.
            오른쪽에 두 몫을 줘서 ➕가 바 한가운데에 오게 맞춘다. */}
        <Link
          href="/me"
          className={`${item(onMe)} flex-[2]`}
          aria-current={onMe ? "page" : undefined}
        >
          <AppleIcon filled={onMe} />
          <span className="text-[10.5px] font-bold">내 사과</span>
        </Link>
      </div>
    </nav>
  );
}
