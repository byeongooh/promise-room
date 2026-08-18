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

/** 독사과가 저절로 사라지기까지의 날 수. */
export const POISON_DAYS = 90;

export interface Stage {
  name: string;
  /** 이 단계가 시작되는 당도 (포함) */
  from: number;
  /** 다음 단계가 시작되는 당도 (미포함) */
  to: number;
}

// 이름과 구간은 핸드오프 §7의 제안값이다. 바뀔 수 있다.
export const STAGES: Stage[] = [
  { name: "새싹", from: 8, to: 11 },
  { name: "묘목", from: 11, to: 13 },
  { name: "첫 열매", from: 13, to: 15 },
  { name: "과수", from: 15, to: 18 },
  { name: "고목", from: 18, to: 20 },
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
 * 독사과 링은 당도가 아니라 **남은 날**을 나타낸다.
 * 벌이 아니라 사라지는 중인 상태로 읽히게 하기 위해서다.
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

/**
 * 독사과가 있으면 오르는 속도가 절반씩 줄어든다.
 * 당도를 깎지 않는 이유는 한 번의 실수가 영구 낙인이 되면 사람들이
 * 앱을 지우기 때문이다. 늦추기만 하면 만회할 길이 항상 열려 있다.
 */
export function growthMultiplier(poisonCount: number): number {
  if (!Number.isFinite(poisonCount) || poisonCount <= 0) return 1;
  return 1 / Math.pow(2, Math.min(poisonCount, 8));
}
