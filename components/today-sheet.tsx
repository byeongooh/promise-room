"use client";

import { useEffect, useState } from "react";
import { Clock, Footprints, Loader2, MapPin, X } from "lucide-react";

import { updateMyMember } from "@/lib/api-client";
import type { PlanNudge } from "@/lib/plan-phase";

// 약속 당일에 뜨는 칸. 두 번, 서로 다른 것을 묻는다.
//
//   morning (오전 9시)   — "오늘이에요. 몇 시에 도착하세요?"  → 계획을 묻는다
//   onway   (1시간 전)   — "가는 중이신가요?"                 → 지금 상태를 묻는다
//
// 왜 나눴는지는 lib/plan-phase.ts의 planNudge 주석 참고. 아침에 "가는 중이세요?"를
// 물으면 아무도 아직 안 갔고, 1시간 전에 "몇 시에 도착하세요?"를 물으면 늦었다.
//
// **이건 진짜 알림이 아니다.** 앱을 닫아둔 채 소리가 울리려면 푸시가 필요한데
// 이 프로젝트는 웹 푸시 우회를 하지 않기로 했다(CLAUDE.md). 지금은 그 시각
// 이후에 앱을 열면 뜬다. 판단은 plan-phase.ts에 있으니 RN 앱에서 그대로 쓴다.
//
// 한 번 닫으면 그 알림은 그날 다시 안 뜬다. 열 때마다 뜨면 그냥 닫는 버튼이
// 되어버려서 정작 물어보고 싶을 때 아무도 안 읽는다. 두 알림은 열쇠가 달라서
// 아침 것을 닫아도 1시간 전 것은 따로 뜬다.

function dismissKey(promiseId: string, meetingMs: number, nudge: PlanNudge): string {
  const d = new Date(meetingMs);
  const ymd = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `applan:nudge:${nudge}:${promiseId}:${ymd}`;
}

function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function clockLabel(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

export default function TodaySheet({
  promiseId,
  title,
  where,
  meetingAt,
  nudge,
  onClose,
}: {
  promiseId: string;
  title: string;
  /** "강남역" 같은 한 줄. 온라인이면 서비스 이름. */
  where: string;
  meetingAt: Date;
  /** 지금 띄울 알림. 판단은 부모가 plan-phase.ts로 한다. null이면 안 뜬다. */
  nudge: PlanNudge | null;
  onClose?: () => void;
}) {
  const [dismissed, setDismissed] = useState(true);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 의존성에 Date 객체가 아니라 숫자를 쓴다. 부모가 렌더할 때마다
  // getPromiseDate()가 새 Date를 만들어서, 객체를 그대로 넣으면 같은 시각인데도
  // 매번 다른 값으로 보여 effect가 계속 다시 돈다.
  const meetingMs = meetingAt.getTime();

  // localStorage는 서버 렌더 때 없다. 처음엔 닫힌 상태로 두고 브라우저에서만 연다.
  useEffect(() => {
    if (!nudge) return;
    try {
      setDismissed(
        window.localStorage.getItem(dismissKey(promiseId, meetingMs, nudge)) === "1"
      );
    } catch {
      setDismissed(false);
    }
  }, [promiseId, meetingMs, nudge]);

  const close = () => {
    if (nudge) {
      try {
        window.localStorage.setItem(dismissKey(promiseId, meetingMs, nudge), "1");
      } catch {
        // 사파리 프라이빗 모드 등에서 막힐 수 있다. 그때는 이번만 닫힌다.
      }
    }
    setDismissed(true);
    onClose?.();
  };

  if (!nudge || dismissed) return null;

  const send = async (key: string, patch: Parameters<typeof updateMyMember>[1]) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await updateMyMember(promiseId, patch);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
      setBusy(null);
    }
  };

  const plus = (min: number) => toHHmm(new Date(meetingMs + min * 60_000));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={nudge === "morning" ? "오늘 도착 시각 정하기" : "가는 중인지 알리기"}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-[var(--tk-paper)] p-5 shadow-lg sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tk-label text-[var(--ap-red)]">
              {nudge === "morning" ? "오늘이에요" : "곧 약속이에요"}
            </p>
            <h2 className="tk-title mt-1 truncate text-[var(--tk-ink)]">{title}</h2>
            <p className="tk-caption mt-1.5 flex flex-wrap items-center gap-x-3 text-[var(--tk-sub)]">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5 opacity-60" />
                {clockLabel(meetingAt)}
              </span>
              <span className="flex items-center gap-1 truncate">
                <MapPin className="size-3.5 shrink-0 opacity-60" />
                {where}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--tk-faint)]
              transition hover:bg-[var(--tk-ground)] hover:text-[var(--tk-sub)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

        {nudge === "morning" ? (
          <>
            <p className="tk-meta mb-2.5 font-medium text-[var(--tk-ink)]">
              몇 시에 도착하실 수 있나요?
            </p>
            <p className="tk-caption mb-3 text-[var(--tk-faint)]">
              약속 시각과 달라도 괜찮아요. 적어두면 다른 사람이 헛기다리지 않아요.
            </p>

            <div className="space-y-1.5">
              {[
                { label: `정시에 갈게요 · ${clockLabel(meetingAt)}`, hhmm: toHHmm(meetingAt) },
                { label: "15분쯤 늦어요", hhmm: plus(15) },
                { label: "30분쯤 늦어요", hhmm: plus(30) },
                { label: "1시간쯤 늦어요", hhmm: plus(60) },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => send(q.hhmm, { arrivalTime: q.hhmm })}
                  disabled={busy !== null}
                  className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl
                    bg-[var(--tk-ground)] text-[14px] font-bold text-[var(--tk-ink)]
                    transition hover:brightness-95 disabled:opacity-60"
                >
                  {busy === q.hhmm && <Loader2 className="size-4 animate-spin" />}
                  {q.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              <input
                type="time"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="직접 도착 시각 정하기"
                className="h-12 w-[116px] shrink-0 rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
                  text-[var(--tk-ink)] outline-none"
              />
              <button
                type="button"
                onClick={() => custom && send(custom, { arrivalTime: custom })}
                disabled={!custom || busy !== null}
                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl
                  bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
                  transition hover:brightness-110 disabled:opacity-40"
              >
                {busy === custom && <Loader2 className="size-4 animate-spin" />}
                직접 정하기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="tk-meta mb-2.5 font-medium text-[var(--tk-ink)]">
              가는 중이신가요?
            </p>
            <p className="tk-caption mb-3 text-[var(--tk-faint)]">
              가고 계시다면 알려주세요. 다른 사람들이 기다릴지 말지 알 수 있어요.
            </p>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => send("onway", { status: "onway" })}
                disabled={busy !== null}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl
                  bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
                  transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === "onway" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Footprints className="size-4" />
                )}
                네, 가고 있어요
              </button>
              <button
                type="button"
                onClick={() => send("arrived", { status: "arrived" })}
                disabled={busy !== null}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl
                  bg-[var(--tk-ground)] text-[14px] font-bold text-[var(--tk-ink)]
                  transition hover:brightness-95 disabled:opacity-60"
              >
                {busy === "arrived" && <Loader2 className="size-4 animate-spin" />}
                이미 도착했어요
              </button>
            </div>

            <p className="tk-caption mt-3 text-center text-[var(--tk-assistive)]">
              못 가게 됐다면 아래 &ldquo;가기 어려울 때&rdquo;에서 알릴 수 있어요.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={close}
          className="tk-caption mt-3 h-11 w-full text-[var(--tk-faint)] transition
            hover:text-[var(--tk-sub)]"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  );
}
