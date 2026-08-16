"use client";

import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import PromiseTicket from "@/components/promise-ticket";
import { getSamplePromise } from "@/lib/sample-promise";

// 약속이 하나도 없는 사람이 보는 화면.
// 대시보드와 관리자 미리보기가 같은 것을 보여줘야 해서 여기 하나만 둔다.

export default function EmptyPromises() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-[var(--tk-paper)] px-6 py-10 text-center shadow-sm ring-1 ring-black/5">
        <div className="mb-2 text-3xl">🎟️</div>
        <h2 className="tk-title mb-1 text-[var(--tk-ink)]">아직 약속이 없습니다</h2>
        <p className="tk-meta mx-auto mb-5 max-w-[26ch] text-balance break-keep text-[var(--tk-sub)]">
          참여한 약속만 여기에 표시됩니다. 새로 만들거나 친구에게 받은 링크로 참여하세요.
        </p>
        <Link href="/create">
          <Button className="h-11 bg-[var(--tk-gold)] px-4 text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90">
            <PlusCircle className="w-4 h-4 mr-1.5" />
            새 약속 만들기
          </Button>
        </Link>
      </div>

      {/* 약속이 어떻게 보이는지 알려주는 예시 한 장.
          저장된 약속이 아니라 화면에서만 만든 것이라 누를 수 없다. */}
      <p className="mt-3 px-1 tk-label text-[var(--tk-faint)]">약속을 만들면 이렇게 보입니다</p>
      <PromiseTicket promise={getSamplePromise()} onOpen={() => {}} example />
    </div>
  );
}
