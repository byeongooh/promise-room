import type { PlaceMemberTime, PlaceSummary } from "@/lib/types";

// 장소 후보를 견주는 기준.
//
// "효율적인 장소"를 숫자 하나로 정하지 않는다. 평균만 쓰면 한 사람이 크게
// 손해봐도 좋아 보이기 때문이다. 실제로 계산해보면 이런 일이 흔하다.
//
//   시청 → 강남: 평균은 3분 줄지만 한 명이 49분에서 52분으로 늘어난다.
//   시청 → 여의도: 평균 6분, 제일 먼 사람 8분, 편차 6분이 같이 준다.
//
// 앞은 "효율적", 뒤는 "공평하다". 우리가 원하는 건 뒤라서 셋을 같이 들고 다니고
// 화면에도 셋을 나란히 보여준다.

/** 소요시간(초) 목록을 요약한다. 빈 목록이면 전부 0. */
export function summarize(durationsSec: number[], skipped: number): PlaceSummary {
  if (durationsSec.length === 0) {
    return { averageSec: 0, maxSec: 0, spreadSec: 0, counted: 0, skipped };
  }

  const total = durationsSec.reduce((a, b) => a + b, 0);
  const max = Math.max(...durationsSec);
  const min = Math.min(...durationsSec);

  return {
    averageSec: Math.round(total / durationsSec.length),
    maxSec: max,
    spreadSec: max - min,
    counted: durationsSec.length,
    skipped,
  };
}

/** 두 요약의 차이. 음수면 후보가 더 낫다(덜 걸린다). */
export interface SummaryDelta {
  averageSec: number;
  maxSec: number;
  spreadSec: number;
}

export function compareSummary(candidate: PlaceSummary, current: PlaceSummary): SummaryDelta {
  return {
    averageSec: candidate.averageSec - current.averageSec,
    maxSec: candidate.maxSec - current.maxSec,
    spreadSec: candidate.spreadSec - current.spreadSec,
  };
}

/**
 * 후보를 한 줄로 평가한다. 숫자를 읽을 줄 몰라도 결론이 보이게.
 *
 * 판단 순서가 곧 우선순위다. 제일 먼 사람이 더 힘들어지는 후보는 평균이
 * 좋아져도 추천하지 않는다 — 모임에서 한 명만 유독 멀면 그 사람이 안 온다.
 */
export function verdict(delta: SummaryDelta, counted: number): {
  tone: "better" | "mixed" | "worse" | "same";
  line: string;
} {
  if (counted === 0) {
    return { tone: "same", line: "출발지를 정한 사람이 없어 비교할 수 없어요." };
  }

  const betterAvg = delta.averageSec < -60;
  const betterMax = delta.maxSec < -60;
  const worseMax = delta.maxSec > 60;
  const betterSpread = delta.spreadSec < -60;

  if (betterAvg && betterMax && betterSpread) {
    return {
      tone: "better",
      line: `세 가지가 모두 지금보다 나아요. 특히 제일 먼 사람이 ${fmtMin(-delta.maxSec)} 덜 걸려요.`,
    };
  }
  if (worseMax) {
    return {
      tone: "mixed",
      line: betterAvg
        ? `평균은 줄지만 제일 먼 사람이 ${fmtMin(delta.maxSec)} 더 걸려요.`
        : `제일 먼 사람이 ${fmtMin(delta.maxSec)} 더 걸려요.`,
    };
  }
  if (betterMax || betterAvg || betterSpread) {
    return { tone: "better", line: "지금보다 낫거나 비슷해요." };
  }
  if (delta.averageSec > 60) {
    return { tone: "worse", line: `평균이 ${fmtMin(delta.averageSec)} 더 걸려요.` };
  }
  return { tone: "same", line: "지금과 비슷해요." };
}

/** 초를 "12분" / "1시간 5분"으로. 부호는 부르는 쪽에서 정한다. */
export function fmtMin(sec: number): string {
  const min = Math.abs(Math.round(sec / 60));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 이동시간이 짧은 순. 화면에서 누가 가깝고 먼지 바로 보이게 정렬한다. */
export function byDuration(a: PlaceMemberTime, b: PlaceMemberTime): number {
  return a.durationSec - b.durationSec;
}
