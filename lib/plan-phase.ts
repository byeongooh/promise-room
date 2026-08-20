import { isOnline, safeMeetingUrl } from "@/lib/meeting-mode";
import { getPromiseDate } from "@/lib/promise-time";
import type { PromiseData } from "@/lib/types";

// 플랜이 "정하는 중"인지 "확정"인지 — 그리고 오늘이 그날인지.
//
// 이 두 판단이 상세 화면의 구성을 통째로 가른다. 정하는 중에는 날짜 투표와
// 장소 비교가 주인공이고, 확정 뒤에는 그것들이 물러나고 "언제 어디로 가는가"와
// "나는 몇 시에 도착하는가"가 앞으로 나온다. 화면마다 각자 판단하면 어긋나므로
// meeting-mode.ts와 같은 이유로 여기 한 곳에서만 정한다.

export type PlanPhase = "planning" | "confirmed";

/**
 * 확정됐는지.
 *
 * confirmedAt이 세 상태인 것에 주의한다(types.ts 참고).
 *   - undefined : 확정 개념이 생기기 전의 옛 플랜. 날짜와 장소가 다 있으면
 *                 이미 확정된 약속으로 다뤄야 한다. 이걸 "정하는 중"으로
 *                 보면 멀쩡히 잡혀 있던 약속이 전부 미정으로 되돌아간다.
 *   - null      : 확정했다가 방장이 되돌린 것. 정하는 중이다.
 *   - ISO       : 확정.
 */
export function isPlanConfirmed(promise: PromiseData): boolean {
  if (promise.confirmedAt === undefined) return isEverythingDecided(promise);
  return promise.confirmedAt !== null;
}

export function planPhase(promise: PromiseData): PlanPhase {
  return isPlanConfirmed(promise) ? "confirmed" : "planning";
}

/** 날짜가 정해졌는지. */
export function hasDate(promise: PromiseData): boolean {
  return getPromiseDate(promise) !== null;
}

/**
 * 갈 곳이 정해졌는지. 온라인이면 좌표가 아니라 링크를 본다 —
 * 온라인 플랜에 좌표를 요구하면 영원히 확정할 수 없다.
 */
export function hasPlace(promise: PromiseData): boolean {
  if (isOnline(promise)) return safeMeetingUrl(promise.meetingUrl) !== null;
  const named = (promise.location ?? "").trim() !== "";
  const located =
    Number.isFinite(promise.locationLat) && Number.isFinite(promise.locationLng);
  return named && located;
}

/** 확정에 필요한 게 다 있는지. */
export function isEverythingDecided(promise: PromiseData): boolean {
  return hasDate(promise) && hasPlace(promise);
}

/**
 * 아직 안 정해진 것들. 확정 버튼을 못 누를 때 이유를 그대로 보여주려고 만든다.
 * "확정할 수 없습니다"만 띄우면 뭘 해야 하는지 알 수 없다.
 */
export function missingForConfirm(promise: PromiseData): string[] {
  const out: string[] = [];
  if (!hasDate(promise)) out.push("날짜");
  if (!hasPlace(promise)) out.push(isOnline(promise) ? "들어갈 링크" : "장소");
  return out;
}

// ---------------------------------------------------------------- 오늘인가

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 오늘이 약속 당일인지. 날짜 미정이면 false. */
export function isMeetingDay(promise: PromiseData, now: Date = new Date()): boolean {
  const target = getPromiseDate(promise);
  return target !== null && sameDay(target, now);
}

/**
 * 확인 안 함 / 가는 중 / 도착 버튼을 열지.
 *
 * 당일 아침부터 연다. 2주 남은 약속에 "가는 중"을 누를 수 있으면 그 값이
 * 아무 뜻도 없어진다 — 이 버튼은 자동 감지가 아니라 사람이 누르는 신호라서,
 * 누를 수 있는 때를 좁히는 것 자체가 신호의 정확도다.
 *
 * 이미 지난 약속에도 열어둔다. 6시 약속에 6시 10분 도착한 사람이 "도착"을
 * 누를 수 없으면 안 되기 때문이다.
 */
export function isStatusOpen(promise: PromiseData, now: Date = new Date()): boolean {
  const target = getPromiseDate(promise);
  if (!target) return false;
  return sameDay(target, now) || target.getTime() < now.getTime();
}

/**
 * 상태 버튼이 아직 안 열렸을 때 언제 열리는지 한 줄.
 * 버튼을 그냥 감추면 없어진 줄 알기 때문에 자리는 남기고 이유를 적는다.
 */
export function statusOpensWhen(promise: PromiseData): string {
  const target = getPromiseDate(promise);
  if (!target) return "날짜가 정해지면 열려요";
  return "약속 당일 아침에 열려요";
}

// ---------------------------------------------------------------- 알림

/**
 * 알림이 뜨는 두 순간.
 *
 *   morning : 약속 당일 오전 9시 — "오늘이에요. 몇 시에 도착하세요?"
 *   onway   : 약속 1시간 전     — "가는 중이신가요? 가고 있으면 알려주세요"
 *
 * 두 순간을 나눈 이유는 묻는 것이 다르기 때문이다. 아침에는 아직 안 나섰으니
 * *계획*(몇 시에 갈지)을 묻고, 1시간 전에는 이미 움직일 때라 *지금 상태*를
 * 묻는다. 아침에 "가는 중이세요?"를 물으면 아무도 아직 안 갔고, 1시간 전에
 * "몇 시에 도착하세요?"를 물으면 이미 늦었다.
 *
 * **이건 아직 진짜 푸시가 아니다.** 웹에서는 앱을 닫아둔 채로 소리를 울릴
 * 방법이 없다(CLAUDE.md — 웹 푸시 우회는 안 한다). 지금은 그 시각 이후에
 * 앱을 열면 뜬다. 다만 **"언제 무엇을 물을지"라는 판단은 여기 다 들어 있어서**,
 * RN 앱으로 옮길 때 서버가 morningNudgeAt·onwayNudgeAt 시각에 푸시를 걸고
 * 같은 조건으로 걸러내면 된다. 화면이 아니라 이 규칙이 남는 부분이다.
 */
export type PlanNudge = "morning" | "onway";

/** 알림을 판단할 때 필요한 "나"의 상태. member 문서에서 온다. */
export interface NudgeSubject {
  arrivalAt?: string | null;
  status?: "unknown" | "onway" | "arrived";
  attendance?: "going" | "cant";
}

/** 아침 알림 시각 — 약속 당일 오전 9시. 날짜 미정이면 null. */
export function morningNudgeAt(promise: PromiseData): Date | null {
  const target = getPromiseDate(promise);
  if (!target) return null;
  const at = new Date(target);
  at.setHours(9, 0, 0, 0);
  return at;
}

/** 출발 알림 시각 — 약속 1시간 전. */
export function onwayNudgeAt(promise: PromiseData): Date | null {
  const target = getPromiseDate(promise);
  return target ? new Date(target.getTime() - 60 * 60_000) : null;
}

/**
 * 약속이 끝난 뒤에도 30분은 "가는 중?"을 열어둔다.
 * 6시 약속에 6시 10분 도착하는 사람이 그때 눌러야 하기 때문이다.
 */
const ONWAY_GRACE_MS = 30 * 60_000;

/**
 * 지금 이 사람에게 띄울 알림. 없으면 null.
 *
 * 둘 다 해당하면 onway가 이긴다 — 더 급하고, 더 가까운 일을 묻는다.
 */
export function planNudge(
  promise: PromiseData,
  me: NudgeSubject,
  now: Date = new Date()
): PlanNudge | null {
  if (!isPlanConfirmed(promise)) return null;
  // 안 가기로 한 사람에게 "가는 중이세요?"를 묻는 건 그냥 실례다.
  if (me.attendance === "cant") return null;

  const target = getPromiseDate(promise);
  if (!target) return null;

  const t = target.getTime();
  const nowMs = now.getTime();
  const onwayFrom = onwayNudgeAt(promise)!.getTime();

  // 1시간 전 ~ 약속 시각 + 30분 : 이미 눌렀으면 다시 묻지 않는다.
  if (nowMs >= onwayFrom && nowMs <= t + ONWAY_GRACE_MS) {
    return (me.status ?? "unknown") === "unknown" ? "onway" : null;
  }

  // 그 이전, 당일 오전 9시부터 : 도착 시각을 아직 안 적었을 때만.
  //
  // 갈 곳이 안 정해졌으면 묻지 않는다. 어디로 가는지 모르는데 몇 시에
  // 도착하겠냐고 물으면 대답할 수가 없다.
  if (!hasPlace(promise)) return null;
  if (me.arrivalAt) return null;

  const morning = morningNudgeAt(promise)!.getTime();
  return nowMs >= morning && nowMs < onwayFrom ? "morning" : null;
}
