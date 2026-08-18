"use client";

import Link from "next/link";

import PromiseTicket from "@/components/promise-ticket";
import { getSamplePromise } from "@/lib/sample-promise";

// 플랜이 하나도 없는 사람이 보는 화면 (시안 1-6).
//
// 여기서 사과 요약 카드는 그리지 않는다. 홈이 목록보다 위에 이미 그리고
// 있고, 플랜이 0개여도 사과는 남는다는 것이 이 화면의 요점이라 위쪽 카드가
// 그대로 보이는 것 자체가 메시지다.
//
// 대시보드와 관리자 미리보기가 같은 것을 보여줘야 해서 여기 하나만 둔다.

export default function EmptyPromises() {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 tk-label text-[var(--tk-faint)]">다가오는 플랜 0</p>

      {/* 플랜이 어떻게 보이는지 알려주는 예시 한 장.
          저장된 것이 아니라 화면에서만 만든 거라 누를 수 없다. */}
      <PromiseTicket promise={getSamplePromise()} onOpen={() => {}} example />

      <p className="tk-body mt-2 px-1 leading-relaxed text-[var(--tk-sub)]">
        아직 플랜이 없어요. 카카오톡으로 링크를 보내면 친구가 바로 들어옵니다.
      </p>

      <Link
        href="/create"
        className="flex h-[52px] items-center justify-center rounded-[12px]
          bg-[var(--tk-ink)] text-[15px] font-bold text-[var(--tk-paper)]
          transition hover:brightness-110 focus-visible:outline-2
          focus-visible:outline-offset-2 focus-visible:outline-[var(--ap-red)]"
      >
        플랜 만들기
      </Link>
    </div>
  );
}
