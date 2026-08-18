"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";

import AppleGauge from "@/components/apple-gauge";
import TabBar from "@/components/tab-bar";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { useAppleStats } from "@/hooks/use-apple-stats";
import {
  BRIX_MAX,
  BRIX_MIN,
  formatBrix,
  stageOf,
  toNextStage,
} from "@/lib/brix";

// 내 사과 — 이 피벗의 새 얼굴.
//
// 약속은 끝나면 사라지지만 사과는 남는다. 그래서 다가오는 플랜이 0개인
// 주에도 앱을 열 이유가 된다는 것이 가설 1이다.

export default function MyApplePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { ready } = useFirebaseAuth();
  const stats = useAppleStats(session?.user?.id, ready);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--tk-ground)]">
        <Loader2 className="size-6 animate-spin text-[var(--tk-faint)]" />
      </div>
    );
  }
  if (!session) return null;

  const stage = stageOf(stats.brix);
  const remain = toNextStage(stats.brix);
  const next = remain !== null ? stageOf(stats.brix + remain + 0.01) : null;

  return (
    <div className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-lg px-4 pb-24 pt-5">
        <Link
          href="/"
          className="-ml-2 mb-3 inline-flex h-11 items-center gap-1.5 rounded-lg px-2
            text-sm font-medium text-[var(--tk-sub)] hover:text-[var(--tk-ink)]"
        >
          <ArrowLeft className="size-4" /> 홈
        </Link>

        {/* 게이지 */}
        <section className="mb-3 rounded-xl bg-[var(--tk-paper)] px-4 py-7 text-center
          shadow-sm ring-1 ring-[var(--tk-line)]">
          <div className="flex justify-center">
            <AppleGauge brix={stats.brix} size={212} />
          </div>

          <div className="mt-5 flex items-end justify-center gap-1.5">
            <span className="tk-numeral text-[var(--tk-ink)]">{formatBrix(stats.brix)}</span>
            <span className="mb-1.5 text-[13px] font-bold text-[var(--tk-faint)]">Brix</span>
          </div>
          <p className="mt-1 text-[15px] font-bold text-[var(--ap-red)]">{stage.name}</p>

          {/* 게이지 양 끝 눈금 */}
          <div className="mx-auto mt-4 flex w-40 items-center gap-2">
            <span className="tk-caption tabular-nums text-[var(--tk-faint)]">{BRIX_MIN}</span>
            <span className="h-px flex-1 bg-[var(--tk-line)]" />
            <span className="tk-caption tabular-nums text-[var(--tk-faint)]">{BRIX_MAX}</span>
          </div>

          {next && remain !== null && (
            <p className="tk-caption mt-3 text-[var(--tk-faint)]">
              다음 단계 {next.name}까지 {remain.toFixed(1)} Brix
            </p>
          )}
        </section>

        {/* 아직 수확이 없다는 사실을 숨기지 않는다 */}
        {stats.brixIsPlaceholder && (
          <p className="tk-caption mb-3 rounded-xl bg-[var(--ap-honey-weak)] px-3.5 py-3
            leading-relaxed text-[var(--tk-sub)]">
            아직 수확한 플랜이 없어서 당도가 <b>시작값 그대로</b>예요. 플랜이 끝나고 서로
            평가하면 그때부터 조금씩 오릅니다.
          </p>
        )}

        {/* 통계 2열 — 이건 진짜 값이다 */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-[var(--tk-line)]">
            <p className="tk-label text-[var(--tk-faint)]">함께한 플랜</p>
            <p className="mt-1.5 text-[22px] font-extrabold tabular-nums text-[var(--tk-ink)]">
              {stats.loading ? "—" : `${stats.planCount}회`}
            </p>
            {!stats.loading && stats.pastCount > 0 && (
              <p className="tk-caption mt-0.5 text-[var(--tk-faint)]">
                이미 지난 것 {stats.pastCount}회
              </p>
            )}
          </div>
          <div className="rounded-xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-[var(--tk-line)]">
            <p className="tk-label text-[var(--tk-faint)]">함께한 사람</p>
            <p className="mt-1.5 text-[22px] font-extrabold tabular-nums text-[var(--tk-ink)]">
              {stats.loading ? "—" : `${stats.partnerCount}명`}
            </p>
          </div>
        </div>

        {/* 독사과 — 없을 때도 무엇인지 알려준다 */}
        <section className="mb-3 rounded-xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-[var(--tk-line)]">
          <p className="tk-label mb-2 text-[var(--tk-faint)]">독사과</p>
          {stats.poison.length === 0 ? (
            <p className="tk-body text-[var(--tk-sub)]">
              아직 없어요. 늦으면 한 알 달리는데, <b>당도를 깎지는 않고</b> 오르는 속도만
              절반이 됩니다. 90일이 지나면 저절로 사라져요.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.poison.map((p) => (
                <li key={p.promiseId} className="tk-body text-[var(--tk-sub)]">
                  {p.expiresAt}에 사라짐
                </li>
              ))}
            </ul>
          )}
        </section>

        {stats.error && (
          <p className="tk-caption text-[var(--tk-warn)]">{stats.error}</p>
        )}

        <p className="tk-caption mt-4 text-center leading-relaxed text-[var(--tk-faint)]">
          단계 · 당도 · 함께한 횟수까지가 남이 보는 전부예요.
          <br />
          어느 플랜에서 늦었는지는 아무에게도 보이지 않아요.
        </p>

        {/* 헤더에 있던 로그아웃을 여기로 옮겼다. 자주 누르는 것이 아니라
            홈 맨 위 자리를 차지할 이유가 없다. */}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="tk-caption mt-6 h-11 w-full rounded-[10px] text-[var(--tk-faint)]
            ring-1 ring-[var(--tk-line)] transition hover:bg-[var(--tk-paper)]"
        >
          로그아웃
        </button>
      </div>

      <TabBar />
    </div>
  );
}
