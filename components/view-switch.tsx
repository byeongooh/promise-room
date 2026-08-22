"use client";

import Link from "next/link";
import { CalendarDays, List } from "lucide-react";

// 홈을 보는 두 가지 방식 — 목록과 달력.
//
// **탭바의 목적지가 아니라 홈 안의 전환이다.** 둘은 같은 플랜을 다르게 보는
// 것이라 서로 다른 곳이 아니다. 탭으로 갈라놨더니 목적지가 셋이 되면서
// 가운데 ➕를 기준으로 좌우가 안 맞았는데, 그건 화면 배치의 문제가 아니라
// 애초에 나누지 말았어야 할 것을 나눈 결과였다.
//
// 이름을 "목록 / 달력"으로 둔 이유: "일정"은 달력도 일정을 보여줘서 구분이
// 안 된다. 이 둘은 무엇을 보느냐가 아니라 **어떻게 보느냐**가 다르다 —
// 다가오는 순서로 늘어놓느냐, 날짜 칸에 얹느냐.
//
// 주소는 그대로 둘로 나눠 둔다(/ 와 /calendar). 한 주소에서 상태로 가르면
// 달력을 보다가 새로고침했을 때 목록으로 돌아가고, 링크로 건네줄 수도 없다.

export default function ViewSwitch({ active }: { active: "list" | "calendar" }) {
  const seg = (on: boolean) =>
    `flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px]
     font-bold transition ${
       on
         ? "bg-[var(--tk-paper)] text-[var(--tk-ink)] shadow-sm"
         : "text-[var(--tk-faint)] hover:text-[var(--tk-sub)]"
     }`;

  return (
    <nav aria-label="보기 방식" className="mb-3 flex gap-1 rounded-xl bg-[var(--tk-ground)] p-1">
      <Link href="/" className={seg(active === "list")} aria-current={active === "list" ? "page" : undefined}>
        <List className="size-3.5" />
        목록
      </Link>
      <Link
        href="/calendar"
        className={seg(active === "calendar")}
        aria-current={active === "calendar" ? "page" : undefined}
      >
        <CalendarDays className="size-3.5" />
        달력
      </Link>
    </nav>
  );
}
