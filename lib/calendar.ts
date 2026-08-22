import { getPromiseDate } from "@/lib/promise-time";
import type { CalendarNote, PromiseData } from "@/lib/types";

// 달력 한 달을 만드는 계산. 화면과 떼어놔서 숫자만 따로 검산할 수 있게 둔다.
//
// **날짜 열쇠는 전부 현지 기준 "YYYY-MM-DD" 문자열이다.**
// Date 객체를 열쇠로 쓰면 같은 날인데 시각이 달라 안 묶이고, UTC로 만들면
// 한국에서 오전 9시 이전 약속이 전날로 밀린다. 문자열로 한 번 눌러 놓으면
// 그 뒤로는 비교가 단순해진다.

/** Date → 현지 기준 "YYYY-MM-DD". */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 오늘의 열쇠. */
export function todayKey(now: Date = new Date()): string {
  return dateKey(now);
}

export interface CalendarCell {
  /** 이 칸의 날짜. 앞뒤 달의 빈 칸이면 null. */
  key: string | null;
  /** 화면에 찍을 숫자. 빈 칸이면 0. */
  day: number;
  /** 일요일인가 — 색을 달리 준다. */
  sunday: boolean;
  /** 오늘인가. */
  today: boolean;
  /** 이미 지난 날인가(오늘은 지나지 않은 것으로 본다). */
  past: boolean;
}

/**
 * 한 달을 7칸씩 끊어 만든다. 앞뒤로 빈 칸을 채워 항상 온전한 주 단위로 돌려준다.
 *
 * 빈 칸을 null 열쇠로 두는 이유: 앞뒤 달의 날짜를 흐리게 보여주는 방식도
 * 있지만, 그러면 "26일"이 두 번 보여서 누를 때 헷갈린다. 이 앱의 달력은
 * 훑어보는 용도가 아니라 눌러서 그날로 들어가는 입구라 애매한 칸을 두지 않는다.
 */
export function monthGrid(year: number, month: number, now: Date = new Date()): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay(); // 0=일
  const days = new Date(year, month, 0).getDate();
  const tKey = todayKey(now);

  const cells: CalendarCell[] = [];
  const blank = (): CalendarCell => ({ key: null, day: 0, sunday: false, today: false, past: false });

  for (let i = 0; i < lead; i++) cells.push(blank());

  for (let d = 1; d <= days; d++) {
    const key = dateKey(new Date(year, month - 1, d));
    cells.push({
      key,
      day: d,
      sunday: new Date(year, month - 1, d).getDay() === 0,
      today: key === tKey,
      past: key < tKey,
    });
  }

  // 마지막 주를 채운다. 줄 수가 달마다 달라지면 아래 내용이 위아래로 튄다.
  while (cells.length % 7 !== 0) cells.push(blank());

  return cells;
}

/** 이 달 기준 이전/다음 달. 12월 다음이 다음 해 1월이 되게. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 플랜을 날짜별로 묶는다.
 *
 * 날짜를 아직 안 정한 플랜은 어디에도 안 들어간다 — 달력은 시간 축인데
 * 그 축에 자리가 없기 때문이다. 대신 화면에서 "날짜 정하는 중" 묶음으로
 * 따로 보여준다(그렇게 안 하면 만들어놓고 잊는다).
 */
export function groupPlansByDate(plans: PromiseData[]): Record<string, PromiseData[]> {
  const out: Record<string, PromiseData[]> = {};
  for (const p of plans) {
    const at = getPromiseDate(p);
    if (!at) continue;
    const k = dateKey(at);
    (out[k] ??= []).push(p);
  }
  // 같은 날 여러 개면 이른 시각부터.
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => {
      const ta = getPromiseDate(a)?.getTime() ?? 0;
      const tb = getPromiseDate(b)?.getTime() ?? 0;
      return ta - tb;
    });
  }
  return out;
}

/** 메모를 날짜별로 묶는다. */
export function groupNotesByDate(notes: CalendarNote[]): Record<string, CalendarNote[]> {
  const out: Record<string, CalendarNote[]> = {};
  for (const n of notes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) continue;
    (out[n.date] ??= []).push(n);
  }
  return out;
}

/** 날짜를 아직 안 정한 플랜들. 달력 아래에 따로 모아 보여준다. */
export function undatedPlans(plans: PromiseData[]): PromiseData[] {
  return plans.filter((p) => getPromiseDate(p) === null);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "8월 24일 (월)" */
export function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const at = new Date(y, m - 1, d);
  return `${m}월 ${d}일 (${WEEKDAYS[at.getDay()]})`;
}

/** "2026년 8월" */
export function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

// ---------------------------------------------------------------- 메모 칩
//
// "눌러서 담기" — 적는 게 원래 귀찮은 일이라 타이핑을 없애는 쪽으로 민다.

/**
 * 처음 쓰는 사람에게만 보여줄 기본 문구.
 *
 * 이력이 하나도 없으면 칩이 텅 비어서 이 기능이 뭘 하는 건지 알 수가 없다.
 * 자리만 메우는 용도라 이력이 쌓이면 자연히 밀려난다.
 */
const SEED_CHIPS = ["현금 뽑기", "선물 사기", "충전기 챙기기", "예약 확인"];

/**
 * 자주 쓴 메모 문구를 많이 쓴 순으로.
 *
 * 목록을 박아두지 않고 **본인 이력에서 뽑는다.** 자주 적는 것은 사람마다
 * 다른데("약 챙기기"가 필요한 사람과 "차 기름"이 필요한 사람은 다르다),
 * 남이 정해준 목록은 결국 안 쓰인다. 쓸수록 자기 목록이 된다.
 *
 * 이미 그 자리에 적어둔 것(exclude)은 뺀다 — 같은 걸 두 번 담게 하면
 * 칩이 도움이 아니라 실수를 부른다.
 */
export function frequentTexts(
  notes: CalendarNote[],
  exclude: string[] = [],
  limit = 6
): string[] {
  const taken = new Set(exclude.map((t) => t.trim()));

  const count = new Map<string, number>();
  for (const n of notes) {
    const t = n.text.trim();
    if (!t || taken.has(t)) continue;
    count.set(t, (count.get(t) ?? 0) + 1);
  }

  const out = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  for (const s of SEED_CHIPS) {
    if (out.length >= limit) break;
    if (!out.includes(s) && !taken.has(s)) out.push(s);
  }
  return out.slice(0, limit);
}
