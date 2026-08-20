"use client";

import { useState } from "react";
import { CalendarDays, Crown, Loader2 } from "lucide-react";

import { confirmDate } from "@/lib/api-client";
import { formatWhen } from "@/lib/promise-time";

// 확정된 날짜를 방장이 바꾸는 칸.
//
// 장소는 확정 뒤에도 "다시 정하기"로 되돌려 바꿀 수 있었는데 날짜는 그 길이
// 없었다. 날짜 투표 칸은 확정되면 물러나기 때문이다. 실제로는 "장소는 그대로고
// 시간만 한 시간 미루자"가 훨씬 흔한 일이라, 되돌리지 않고 바로 고치는 길을 낸다.
//
// 서버(date-service.confirmDate)는 만든 사람인지 다시 확인하고, 바뀐 시각으로
// 전원의 출발 시각을 다시 계산한다. 각자 적어둔 도착 시각은 옛 날짜에 붙어 있어
// 같이 비운다 — 그래서 아래에 그 사실을 미리 적어둔다.

function hideEmptyText(value: string, focused: boolean): React.CSSProperties {
  return value === "" && !focused ? { color: "transparent" } : {};
}

export default function ChangeWhen({
  promiseId,
  meetingAt,
  onChanged,
}: {
  promiseId: string;
  /** 지금 정해진 약속 시각. */
  meetingAt: Date | null;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [focused, setFocused] = useState<"date" | "time" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /** 칸을 열 때 지금 값으로 채워둔다. 빈 칸부터 시작하면 매번 다시 골라야 한다. */
  const start = () => {
    if (meetingAt) {
      const p = (n: number) => String(n).padStart(2, "0");
      setDate(`${meetingAt.getFullYear()}-${p(meetingAt.getMonth() + 1)}-${p(meetingAt.getDate())}`);
      setTime(`${p(meetingAt.getHours())}:${p(meetingAt.getMinutes())}`);
    }
    setDone(null);
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (busy || !date || !time) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmDate(promiseId, { date, time });
      setDone(
        res.recalculated > 0
          ? `${res.recalculated}명의 출발 시각을 다시 계산했어요.`
          : "바꿨어요."
      );
      setOpen(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "날짜를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-1 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
        <Crown className="size-3.5 text-[var(--ap-honey)]" />
        약속 시각 바꾸기
      </p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        지금은 {formatWhen(meetingAt)}이에요. 만든 사람만 바꿀 수 있어요.
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}
      {done && <p className="tk-caption mb-2 text-[var(--ap-leaf)]">{done}</p>}

      {open ? (
        <>
          {/* 좁은 폰에서 날짜·시간을 가로로 나란히 두면 네이티브 위젯이 겹친다.
              만들기 폼에서 겪은 것과 같은 이유로 세로로 쌓는다. */}
          <div className="space-y-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onFocus={() => setFocused("date")}
              onBlur={() => setFocused(null)}
              aria-label="새 약속 날짜"
              className="h-11 w-full rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
                text-[var(--tk-ink)] outline-none"
              style={hideEmptyText(date, focused === "date")}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onFocus={() => setFocused("time")}
              onBlur={() => setFocused(null)}
              aria-label="새 약속 시간"
              className="h-11 w-full rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
                text-[var(--tk-ink)] outline-none"
              style={hideEmptyText(time, focused === "time")}
            />
          </div>

          <p className="tk-caption mt-2.5 rounded-[10px] bg-[var(--ap-red-weak)] px-3 py-2.5 text-[var(--ap-red)]">
            바꾸면 참여자들이 적어둔 &ldquo;몇 시에 도착&rdquo;은 지워져요. 옛 날짜에
            붙어 있던 값이라 그대로 두면 틀린 시각이 됩니다. 출발 시각은 새로 계산돼요.
          </p>

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !date || !time}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl
                bg-[var(--tk-ink)] text-[13px] font-bold text-[var(--tk-paper)]
                transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarDays className="size-4" />
              )}
              이 시각으로 바꾸기
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="tk-caption h-11 px-4 font-bold text-[var(--tk-faint)]
                transition hover:text-[var(--tk-sub)] disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl
            bg-[var(--tk-ground)] text-[13px] font-bold text-[var(--tk-ink)]
            transition hover:brightness-95"
        >
          <CalendarDays className="size-4" />
          날짜·시간 바꾸기
        </button>
      )}
    </section>
  );
}
