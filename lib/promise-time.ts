import { Timestamp } from "firebase/firestore";

import type { PromiseData } from "@/lib/types";

// 약속 화면의 핵심은 "언제인가"다. 날짜 문자열과 시간 문자열이 따로 저장돼
// 있어서, 화면마다 제각각 계산하지 않도록 여기로 모은다.

export type Tone = "past" | "now" | "soon" | "later";

export interface Countdown {
  /** 스텁에 크게 들어가는 값. 예: "D-2", "오늘", "지남" */
  badge: string;
  /** 그 아래 작은 설명. 예: "이틀 뒤", "3시간 뒤" */
  detail: string;
  tone: Tone;
}

/** date(문자열 또는 Timestamp) + time("HH:mm")을 실제 시각으로 합친다. */
export function getPromiseDate(promise: Pick<PromiseData, "date" | "time">): Date | null {
  const { date, time } = promise;

  let base: Date | null = null;
  if (date instanceof Timestamp) {
    base = date.toDate();
  } else if (typeof date === "string" && date.trim() !== "") {
    const [y, m, d] = date.split("-").map(Number);
    if (y && m && d) base = new Date(y, m - 1, d);
  }
  if (!base || Number.isNaN(base.getTime())) return null;

  const [hh, mm] = (time ?? "").split(":").map(Number);
  base.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return base;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * 남은 시간을 스텁용 문구로 만든다.
 *
 * 날짜를 아직 안 정한 플랜은 "정하는 중"이다. "—"처럼 비워두면 데이터가
 * 빠진 것처럼 보이는데, 이건 빠진 게 아니라 아직 고르는 단계라는 상태다.
 */
export function getCountdown(target: Date | null, now: Date = new Date()): Countdown {
  if (!target) return { badge: "미정", detail: "정하는 중", tone: "later" };

  const diffMs = target.getTime() - now.getTime();
  const dayDiff = Math.round(
    (startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000
  );

  if (diffMs < 0) {
    const daysAgo = Math.abs(dayDiff);
    return {
      badge: "지남",
      detail: daysAgo === 0 ? "오늘 지남" : `${daysAgo}일 전`,
      tone: "past",
    };
  }

  // 오늘 안에 남은 약속은 시/분으로 보여준다
  if (dayDiff === 0) {
    const hours = Math.floor(diffMs / 3_600_000);
    const mins = Math.round((diffMs % 3_600_000) / 60_000);
    return {
      badge: "오늘",
      detail: hours > 0 ? `${hours}시간 뒤` : `${Math.max(mins, 1)}분 뒤`,
      tone: "now",
    };
  }

  const words: Record<number, string> = { 1: "내일", 2: "모레" };
  return {
    badge: `D-${dayDiff}`,
    detail: words[dayDiff] ?? `${dayDiff}일 뒤`,
    tone: dayDiff <= 3 ? "soon" : "later",
  };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "3월 15일 (일) 16:00" */
export function formatWhen(target: Date | null): string {
  if (!target) return "날짜 정하는 중";
  const m = target.getMonth() + 1;
  const d = target.getDate();
  const w = WEEKDAYS[target.getDay()];
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  return `${m}월 ${d}일 (${w}) ${hh}:${mm}`;
}

const COORD_RE = /^\(?\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*\)?$/;

/**
 * 장소가 좌표 문자열로 저장된 옛 데이터가 있다.
 * 화면에 위경도를 그대로 보여주는 건 아무 의미가 없으므로 대체 문구를 쓴다.
 */
export function displayLocation(location?: string): string {
  const v = (location ?? "").trim();
  if (v === "") return "장소 미정";
  if (COORD_RE.test(v)) return "지도에서 고른 위치";
  return v;
}

/** 날짜를 아직 안 정한 플랜인지. */
export function isDateUndecided(promise: Pick<PromiseData, "date" | "time">): boolean {
  return getPromiseDate(promise) === null;
}

/**
 * 다가오는 약속을 가까운 순으로, 지난 약속은 뒤로 보낸다.
 *
 * 날짜 미정 플랜은 다가오는 묶음의 끝에 둔다. 시간 축이 없어서 어디에도
 * 끼울 수 없는데, 지난 것으로 내리면 아직 살아 있는 약속이 묻힌다.
 */
export function sortByWhen<T extends Pick<PromiseData, "date" | "time">>(
  promises: T[],
  now: Date = new Date()
): T[] {
  return [...promises].sort((a, b) => {
    const da = getPromiseDate(a);
    const dbb = getPromiseDate(b);
    if (!da) return 1;
    if (!dbb) return -1;

    const aPast = da.getTime() < now.getTime();
    const bPast = dbb.getTime() < now.getTime();
    if (aPast !== bPast) return aPast ? 1 : -1;
    // 지난 약속끼리는 최근 것부터, 다가오는 약속끼리는 임박한 것부터
    return aPast ? dbb.getTime() - da.getTime() : da.getTime() - dbb.getTime();
  });
}
