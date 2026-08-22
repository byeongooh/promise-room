import type { PromiseData } from "@/lib/types";
import { POISON_PENALTY } from "@/lib/brix";
import { getPromiseDate } from "@/lib/promise-time";

// 수확 — 플랜이 끝난 뒤 서로 "제시간에 왔는지"를 묻고, 그 결과로 당도가 오르거나
// 독사과가 달린다. 이 앱이 재려는 평판이 실제로 만들어지는 유일한 자리다.
//
// 화면과 서버가 같은 판단을 해야 해서 계산은 전부 여기 순수 함수로 둔다.
// (brix.ts·plan-phase.ts와 같은 이유다.)

/** 평가 한 표. */
export type HarvestVote = "onTime" | "late" | "noShow";

export interface HarvestSubject {
  uid: string;
  name: string;
}

/** 한 사람이 낸 표 묶음. */
export interface HarvestBallotLike {
  voterUid: string;
  votes: Record<string, HarvestVote>;
}

export interface HarvestResultLike {
  uid: string;
  name: string;
  onTime: number;
  late: number;
  noShow: number;
  poison: boolean;
  delta: number;
}

/**
 * 약속이 끝나고 수확이 열리기까지의 시간.
 *
 * 0으로 두면 약속 시각에 바로 "쟤 늦었어요" 버튼이 뜬다. 아직 같이 있는데
 * 서로를 평가하게 만드는 화면은 만들면 안 된다. 3시간이면 대체로 자리가
 * 파한 뒤라, 각자 돌아가는 길에 누른다.
 */
export const HARVEST_OPEN_DELAY_MS = 3 * 60 * 60_000;

/**
 * 열린 뒤 표를 받는 기간. 지나면 낸 표만으로 정산한다.
 *
 * 무기한 열어두면 아무도 안 누른 플랜이 영원히 "수확할 것"으로 남아 목록을
 * 더럽힌다. 반대로 하루는 짧다 — 주말 약속을 월요일에 정산하려면 이틀은 있어야 한다.
 */
export const HARVEST_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * 독사과가 달리는 데 필요한 최소 표.
 *
 * **2표인 것이 이 기능에서 제일 중요한 안전장치다.** 과반만 조건으로 두면
 * 2인 약속에서 상대 한 명의 표가 곧 과반이라, 마음만 먹으면 남의 평판을
 * 혼자 깎을 수 있다. 사람이 둘뿐인 약속이 제일 흔한데 거기가 제일 위험해진다.
 * 두 사람이 같은 말을 해야 달리게 하면 1:1에서는 독사과가 아예 안 달린다 —
 * 벌을 놓치는 쪽이 억울한 낙인을 찍는 쪽보다 낫다.
 */
export const POISON_MIN_VOTES = 2;

/** 잘 지킨 플랜 하나가 올리는 당도. */
export const BRIX_GAIN = 0.3;

/**
 * 언제 수확이 열리는가. 날짜나 시간을 모르면 null(수확 자체가 없다).
 */
export function harvestOpensAt(promise: PromiseData): Date | null {
  const at = getPromiseDate(promise);
  if (!at) return null;
  return new Date(at.getTime() + HARVEST_OPEN_DELAY_MS);
}

/** 언제 닫히는가. */
export function harvestClosesAt(promise: PromiseData): Date | null {
  const opens = harvestOpensAt(promise);
  if (!opens) return null;
  return new Date(opens.getTime() + HARVEST_WINDOW_MS);
}

export type HarvestWindow = "none" | "waiting" | "open" | "closed";

/**
 * 지금 수확이 어느 국면인가.
 *   none    — 날짜/시간이 없어 수확이라는 개념이 성립하지 않는다
 *   waiting — 아직 약속이 끝나지 않았거나 끝난 직후
 *   open    — 표를 받는 중
 *   closed  — 기간이 지났다. 낸 표로 정산한다
 */
export function harvestWindow(promise: PromiseData, now: Date = new Date()): HarvestWindow {
  const opens = harvestOpensAt(promise);
  if (!opens) return "none";
  if (now < opens) return "waiting";
  const closes = harvestClosesAt(promise)!;
  return now < closes ? "open" : "closed";
}

/**
 * 이번 플랜에서 평가에 참여하는 사람들.
 *
 * **미리 "못 가요"라고 밝힌 사람은 뺀다.** 안 그러면 정직하게 미리 말한 사람이
 * "안 왔어요" 표를 받아 벌을 받는다. 그건 말해준 것에 벌을 주는 셈이라,
 * 다음부터 아무도 미리 말하지 않게 된다.
 *
 * 평가하는 쪽과 평가받는 쪽이 같은 집합인 것도 의도다 — 안 온 사람이 남을
 * 평가하면 자기가 못 본 것을 말하게 된다.
 */
export function harvestSubjects(
  members: Array<{ uid: string; name: string; attendance?: string | null }>
): HarvestSubject[] {
  return members
    .filter((m) => m.attendance !== "cant")
    .map((m) => ({ uid: m.uid, name: m.name }));
}

/**
 * 수확이 성립하는 최소 인원.
 *
 * 혼자 남은 플랜은 평가할 대상이 없다. 둘이면 서로 한 표씩은 낼 수 있어서
 * (독사과는 안 달리지만) 당도는 오른다.
 */
export function canHarvest(subjects: HarvestSubject[]): boolean {
  return subjects.length >= 2;
}

/**
 * 표를 세어 결과를 낸다.
 *
 * 판정 순서에 뜻이 있다.
 *   1. 지적(늦음+안 옴)이 2표 이상이고 정시 표보다 많으면 → 독사과
 *   2. 지적이 있었지만 그 문턱을 못 넘으면 → 변화 없음
 *      (한 사람만 늦었다고 했는데 당도가 오르면 표를 낸 사람이 우습다)
 *   3. 지적이 하나도 없으면 → 당도 상승
 *   4. 아무도 표를 안 냈으면 → 변화 없음. 안 본 것을 상으로 주지 않는다
 */
export function settleHarvest(
  ballots: HarvestBallotLike[],
  subjects: HarvestSubject[]
): HarvestResultLike[] {
  return subjects.map((s) => {
    let onTime = 0;
    let late = 0;
    let noShow = 0;

    for (const b of ballots) {
      if (b.voterUid === s.uid) continue; // 자기 표는 세지 않는다
      const v = b.votes?.[s.uid];
      if (v === "onTime") onTime += 1;
      else if (v === "late") late += 1;
      else if (v === "noShow") noShow += 1;
    }

    const bad = late + noShow;
    const poison = bad >= POISON_MIN_VOTES && bad > onTime;

    let delta = 0;
    if (poison) delta = -POISON_PENALTY;
    else if (bad === 0 && onTime > 0) delta = BRIX_GAIN;

    return { uid: s.uid, name: s.name, onTime, late, noShow, poison, delta };
  });
}

/**
 * 지금 정산해도 되는가.
 *
 * 전원이 냈으면 기다릴 이유가 없고, 기간이 지났으면 더 기다려도 안 온다.
 * 자동으로 도는 작업(cron)이 없어서, 누군가 이 플랜을 열어볼 때 서버가
 * 이 함수로 확인해 정산한다.
 */
export function shouldSettle(
  votedCount: number,
  eligibleCount: number,
  window: HarvestWindow
): boolean {
  if (eligibleCount < 2) return false;
  if (window === "closed") return true;
  return window === "open" && votedCount >= eligibleCount;
}

/** "3명 중 2명 냈어요" 같은 한 줄. */
export function progressLine(votedCount: number, eligibleCount: number): string {
  const left = Math.max(0, eligibleCount - votedCount);
  if (left === 0) return "모두 냈어요";
  return `${eligibleCount}명 중 ${votedCount}명 냈어요 · ${left}명 남음`;
}

/** 결과 한 줄. 화면 세 곳에서 같은 문장을 써야 해서 여기서 만든다. */
export function resultLine(r: HarvestResultLike): string {
  if (r.poison) return "독사과가 달렸어요";
  if (r.delta > 0) return "잘 지켰어요";
  if (r.late + r.noShow > 0) return "늦었다는 표가 있었어요";
  return "표가 모자라 그대로예요";
}

/**
 * 이 플랜에서 내가 아직 평가를 안 했는가 — 홈 목록이 배지를 다는 기준.
 *
 * 서버를 안 부르고 약속 문서만으로 판단한다. 목록에 플랜이 스무 개면 스무 번
 * 부르게 되는데 그럴 값어치가 없다. harvestVoters에 uid만 실려 오는 이유가 이것이다.
 */
export function needsMyHarvest(
  promise: PromiseData & { harvest?: unknown; harvestVoters?: string[] },
  myUid: string | undefined,
  now: Date = new Date()
): boolean {
  if (!myUid) return false;
  if (promise.harvest) return false; // 이미 정산됨
  if (harvestWindow(promise, now) !== "open") return false;
  if ((promise.participantIds?.length ?? 0) < 2) return false;
  return !(promise.harvestVoters ?? []).includes(myUid);
}
