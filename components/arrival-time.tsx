"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";

import { updateMyMember } from "@/lib/api-client";

// "나는 오늘 몇 시까지 가요" — 각자 자기 도착 예정 시각을 적는 칸.
//
// 약속 시각을 고치는 게 아니라 그 위에 각자 얹는 값이다. 6시 모임인데 6시
// 퇴근이라 6시 30분에 오는 사람이 있는데, 그걸 약속 시각을 6시 30분으로
// 바꿔서 표현하면 정시에 올 수 있던 사람까지 늦게 온다. 약속 시각은 그대로
// 두고 "나는 이때 도착"만 따로 받는다.
//
// 방장·방원을 구분하지 않는다. 늦는 데 직책이 없다.

/** Date → "HH:mm" (현지 시각) */
function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "오후 6:30" */
function clockLabel(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function hideEmptyText(value: string, focused: boolean): React.CSSProperties {
  // 비어 있을 때 브라우저가 넣는 "--:--" 회색 글씨를 감춘다.
  // 후보를 안 적은 칸이 대부분이라 그 글씨가 늘 떠 있게 된다.
  return value === "" && !focused ? { color: "transparent" } : {};
}

export default function ArrivalTime({
  promiseId,
  meetingAt,
  arrivalAt,
  onSaved,
  className = "",
}: {
  promiseId: string;
  /** 플랜에 정해진 약속 시각. 없으면 기준이 없어 이 칸을 그리지 않는다. */
  meetingAt: Date | null;
  /** 서버에 저장된 내 도착 시각(ISO). 안 적었으면 null. */
  arrivalAt: string | null;
  onSaved?: (arrivalAt: string | null) => void;
  className?: string;
}) {
  const saved = arrivalAt ? new Date(arrivalAt) : null;
  const savedValid = saved && !Number.isNaN(saved.getTime()) ? saved : null;

  const [value, setValue] = useState(savedValid ? toHHmm(savedValid) : "");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 다른 화면(당일 팝업)에서 저장하면 여기 값도 따라와야 한다.
  useEffect(() => {
    setValue(savedValid ? toHHmm(savedValid) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalAt]);

  // 약속 시각을 모르면 "몇 시에 도착하겠다"의 기준이 없다.
  if (!meetingAt) return null;

  const onTime = toHHmm(meetingAt);
  const dirty = value !== (savedValid ? toHHmm(savedValid) : "");

  /** 약속 시각에서 분을 더한 "HH:mm". 자정을 넘기면 그대로 넘어간 시각이 된다. */
  const plus = (min: number) => toHHmm(new Date(meetingAt.getTime() + min * 60_000));

  const save = async (hhmm: string | null) => {
    if (busy) return;
    setBusy(hhmm === null ? "clear" : "save");
    setError(null);
    try {
      const res = await updateMyMember(promiseId, { arrivalTime: hhmm });
      onSaved?.(res.arrivalAt);
      if (hhmm === null) setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "도착 시각을 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const late = savedValid ? savedValid.getTime() > meetingAt.getTime() : false;
  const early = savedValid ? savedValid.getTime() < meetingAt.getTime() : false;

  return (
    <section
      className={`mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5 ${className}`}
    >
      <p className="mb-1 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
        <Clock className="size-3.5" /> 나는 몇 시에 도착할까요
      </p>
      <p className="tk-caption mb-3 text-[var(--tk-faint)]">
        약속은 {clockLabel(meetingAt)}이에요. 늦거나 일찍 갈 것 같으면 적어두면
        다른 사람이 기다리지 않아요.
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      <div className="flex flex-wrap gap-1.5">
        {[
          { label: "정시에", hhmm: onTime },
          { label: "15분 늦게", hhmm: plus(15) },
          { label: "30분 늦게", hhmm: plus(30) },
          { label: "1시간 늦게", hhmm: plus(60) },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setValue(q.hhmm)}
            disabled={busy !== null}
            className={`tk-caption h-9 rounded-full px-3 transition disabled:opacity-60 ${
              value === q.hhmm
                ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                : "bg-[var(--tk-ground)] text-[var(--tk-sub)] hover:brightness-95"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <input
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="내 도착 시각"
          className="h-11 w-[116px] shrink-0 rounded-xl bg-[var(--tk-ground)] px-3 text-[13px]
            text-[var(--tk-ink)] outline-none"
          style={hideEmptyText(value, focused)}
        />
        <button
          type="button"
          onClick={() => save(value)}
          disabled={!value || busy !== null || !dirty}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl
            bg-[var(--tk-ink)] text-[13px] font-bold text-[var(--tk-paper)]
            transition hover:brightness-110 disabled:opacity-40"
        >
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {savedValid && !dirty ? "저장됨" : "이 시각으로"}
        </button>
        {savedValid && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy !== null}
            aria-label="도착 시각 지우기"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--tk-ground)]
              text-[var(--tk-faint)] transition hover:text-[var(--tk-sub)] disabled:opacity-60"
          >
            {busy === "clear" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          </button>
        )}
      </div>

      {savedValid && (
        <p className="tk-caption mt-2.5 text-[var(--tk-sub)]">
          {late && (
            <>
              약속보다 <b className="text-[var(--ap-red)]">
                {Math.round((savedValid.getTime() - meetingAt.getTime()) / 60_000)}분 늦게
              </b>{" "}
              도착한다고 알렸어요
            </>
          )}
          {early && (
            <>
              약속보다{" "}
              <b className="text-[var(--ap-leaf)]">
                {Math.round((meetingAt.getTime() - savedValid.getTime()) / 60_000)}분 일찍
              </b>{" "}
              도착한다고 알렸어요
            </>
          )}
          {!late && !early && <>약속 시각에 맞춰 간다고 알렸어요</>}
        </p>
      )}
    </section>
  );
}
