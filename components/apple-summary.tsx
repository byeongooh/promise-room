"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import AppleGauge from "@/components/apple-gauge";
import { useAppleStats } from "@/hooks/use-apple-stats";
import { formatBrix, stageOf } from "@/lib/brix";

// 홈 맨 위에 붙는 내 사과 요약.
//
// 목록보다 위에 두는 것이 가설 1의 핵심이다. 약속은 끝나면 사라지지만
// 사과는 남아서, 다가오는 플랜이 0개인 주에도 앱을 열 이유가 된다.
// 그래서 플랜이 하나도 없을 때도 이 카드는 그대로 남는다.

export default function AppleSummary({
  uid,
  ready,
  size = 64,
}: {
  uid: string | undefined;
  ready: boolean;
  size?: number;
}) {
  const stats = useAppleStats(uid, ready);
  const stage = stageOf(stats.brix);

  return (
    <Link
      href="/me"
      className="mb-4 flex items-center gap-3.5 rounded-xl bg-[var(--tk-paper)] p-4
        shadow-sm ring-1 ring-[var(--tk-line)] transition
        hover:brightness-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-[var(--ap-red)]"
    >
      <AppleGauge brix={stats.brix} size={size} className="shrink-0" />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[20px] font-extrabold tabular-nums leading-none text-[var(--tk-ink)]">
            {formatBrix(stats.brix)}
          </span>
          <span className="tk-caption font-bold text-[var(--tk-faint)]">Brix</span>
          <span className="tk-caption ml-1 font-bold text-[var(--ap-red)]">{stage.name}</span>
        </span>

        <span className="tk-caption mt-1 block truncate text-[var(--tk-faint)]">
          {stats.loading
            ? "불러오는 중…"
            : `함께한 플랜 ${stats.planCount}회 · 함께한 사람 ${stats.partnerCount}명`}
        </span>
      </span>

      <ChevronRight className="size-4 shrink-0 text-[var(--tk-faint)]" />
    </Link>
  );
}
