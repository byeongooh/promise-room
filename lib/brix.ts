// 사과 당도(Brix) — 이 앱의 평판 수치.
//
// 당근마켓이 36.5도(체온)에서 시작하듯 모두 13.0에서 시작한다. 0에서
// 시작하면 내려갈 일만 남아 재미가 없고, 새로 온 사람이 무조건 불신자로
// 보인다. 13은 실제로 잘 익은 사과의 평균 당도라 "왜 13인가"를 설명할
// 필요가 없다.
//
// 화면에서 쓰는 계산은 전부 여기 순수 함수로 둔다. React 밖이라
// 테스트하기 쉽고, 나중에 서버(당도 계산)에서도 같은 함수를 쓴다.

export const BRIX_MIN = 8;
export const BRIX_MAX = 20;
export const BRIX_START = 13;

/**
 * 독사과를 "최근 것"으로 보는 기간.
 *
 * 깎인 당도가 돌아오는 기간이 아니다 — 그건 안 돌아온다(poisonPenalty 참고).
 * 이건 화면에 "최근에 문제가 있었나"를 보여주는 창이다. 3년 전 지각과
 * 지난주 지각은 같은 정보가 아닌데, 당도 숫자 하나로는 그 차이가 안 보인다.
 * 당도는 누적된 결과를, 이 창은 최근 상태를 말한다.
 */
export const POISON_DAYS = 90;

export interface Stage {
  name: string;
  /** 이 단계가 시작되는 당도 (포함) */
  from: number;
  /** 다음 단계가 시작되는 당도 (미포함) */
  to: number;
  /** "몇 브릭스는 이 정도로 달다"를 감으로 느끼게 하는 비유 한 줄.
   *  Brix 자체가 숫자로는 안 와닿아서, 다음 단계까지 몇 Brix 남았는지보다
   *  "지금 이 정도 달다"가 더 잘 읽힌다. */
  flavor: string;
}

// **시작값 13은 반드시 구간 안쪽에 앉아야 한다.**
// 처음에는 "첫 열매"가 13~15여서 시작값이 하한선에 정확히 걸려 있었다.
// 독사과가 당도를 깎게 되면서 이게 문제가 됐다 — 한 번만 받아도 12.5가 되어
// 곧장 아래 단계로 떨어진다. 한 번의 지각으로 눈에 보이는 강등이 일어나면
// 앱을 지운다. 그래서 구간을 다시 나눴고, 지금은 **독사과 3개**를 받아야
// (13 → 11.5) 강등된다. 깎이는 것은 즉시 보이되 등급은 천천히 움직인다.
//
// 경계는 전부 정수다 — 화면에 "12 Brix부터"로 적히는 값이라 소수가 섞이면
// 읽기 나빠진다. 폭은 2·2·3·3·2로, 시작값이 있는 "첫 열매"를 넓게 뒀다.
// 사람 대부분이 여기 머무를 텐데 그 안에서 자주 등급이 바뀌면 신호가 아니라
// 소음이 된다.
export const STAGES: Stage[] = [
  { name: "새싹", from: 8, to: 10, flavor: "풋사과처럼 새콤해요" },
  { name: "묘목", from: 10, to: 12, flavor: "사이다 한 모금 정도로 달아요" },
  { name: "첫 열매", from: 12, to: 15, flavor: "잘 익은 사과 그대로예요" },
  { name: "과수", from: 15, to: 18, flavor: "초콜릿처럼 진하게 달아요" },
  { name: "고목", from: 18, to: 20, flavor: "꿀사과라 불릴 만큼 달아요" },
];

export function clampBrix(brix: number): number {
  if (!Number.isFinite(brix)) return BRIX_START;
  return Math.min(BRIX_MAX, Math.max(BRIX_MIN, brix));
}

/** 지금 어느 단계인가. 범위를 벗어나면 양 끝으로 붙인다. */
export function stageOf(brix: number): Stage {
  const b = clampBrix(brix);
  for (const s of STAGES) {
    if (b >= s.from && b < s.to) return s;
  }
  // 정확히 20.0이면 마지막 단계
  return STAGES[STAGES.length - 1];
}

/** 다음 단계. 이미 마지막이면 null. */
export function nextStage(brix: number): Stage | null {
  const cur = stageOf(brix);
  const i = STAGES.indexOf(cur);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** 다음 단계까지 남은 당도. 마지막 단계면 null. */
export function toNextStage(brix: number): number | null {
  const next = nextStage(brix);
  if (!next) return null;
  return Math.max(0, Math.round((next.from - clampBrix(brix)) * 10) / 10);
}

/**
 * 게이지 링을 얼마나 채울지 (0~1).
 * 8 Brix = 0%, 20 Brix = 100%.
 */
export function gaugeRatio(brix: number): number {
  return (clampBrix(brix) - BRIX_MIN) / (BRIX_MAX - BRIX_MIN);
}

/**
 * 독사과 링은 당도가 아니라 **최근 90일 중 남은 날**을 나타낸다.
 * 당도가 회복되는 게 아니라, "최근 독사과"에서 빠지기까지 남은 날이다.
 */
export function poisonRatio(daysLeft: number, total: number = POISON_DAYS): number {
  if (!Number.isFinite(daysLeft) || total <= 0) return 0;
  return Math.min(1, Math.max(0, daysLeft / total));
}

/** 만료 시각까지 며칠 남았나. 지났으면 0. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now.getTime()) / 86_400_000));
}

/** "13.2" — 항상 소수 한 자리. 숫자가 흔들리면 안 되는 화면에서 쓴다. */
export function formatBrix(brix: number): string {
  return clampBrix(brix).toFixed(1);
}

/** "+0.4" / "-0.2" / "±0" — 변화량 표시. */
export function formatDelta(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return "±0";
  const r = Math.round(delta * 10) / 10;
  return (r > 0 ? "+" : "") + r.toFixed(1);
}

/** 독사과 하나가 깎는 당도. */
export const POISON_PENALTY = 0.5;

/**
 * 독사과는 **당도를 실제로 깎는다.**
 *
 * 처음엔 깎지 않고 오르는 속도만 늦췄다. 한 번의 실수가 영구 낙인이 되면
 * 앱을 지운다고 봤기 때문이다. 그런데 그렇게 두면 **당도가 평판으로 쓸 수
 * 없는 숫자가 된다.** 올라가기만 하는 값은 시간이 지나면 누구나 높아져서,
 * 늦게 시작한 성실한 사람과 상습 지각자를 구분하지 못한다. 남의 당도를 보고
 * "이 사람과 약속을 잡아도 될까"를 판단할 수 없으면 이 수치는 장식이다.
 *
 * 당근마켓 매너온도도 올라가기만 하지 않는다. 내려갈 수 있어야 올라간 값에
 * 뜻이 생긴다. 이 앱이 재고 싶은 것이 바로 그 평판이므로 같은 쪽을 택한다.
 *
 * **대신 회복 경로는 반드시 열어둔다.** 깎인 당도는 시간이 지나도 저절로
 * 돌아오지 않지만, 다음 약속을 지키면 오른다. 한 번 늦으면 몇 번 잘 지켜야
 * 제자리인 정도 — 회복이 가능하되 공짜는 아닌 세기로 잡는다.
 *
 * 0.5는 그 세기다. 시작값 13에서 바닥(8)까지 열 번이 걸린다. 한 번의 지각으로
 * 단계가 바뀌면 너무 가혹하고, 열 번을 지각해도 그대로면 신호가 아니다.
 *
 * **단계 경계는 이 값에 맞춰 다시 잡았다**(STAGES 주석 참고). 시작값 13이
 * 구간 하한선에 걸려 있으면 독사과 하나에 바로 강등되는데, 그건 이 세기가
 * 의도한 바가 아니다. 지금은 "첫 열매"가 12~15라 3개를 받아야 등급이 내려간다.
 */
export function poisonPenalty(poisonCount: number): number {
  if (!Number.isFinite(poisonCount) || poisonCount <= 0) return 0;
  return Math.round(poisonCount * POISON_PENALTY * 10) / 10;
}

/**
 * 독사과를 반영한 당도.
 *
 * 서버가 수확에서 이 값을 계산해 저장한다. 화면은 저장된 값을 그대로
 * 보여주기만 한다 — 볼 때마다 다시 계산하면 사람마다 다른 숫자를 본다.
 */
export function applyPoison(brix: number, poisonCount: number): number {
  return clampBrix(clampBrix(brix) - poisonPenalty(poisonCount));
}
