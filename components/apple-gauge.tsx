"use client";

import { gaugeRatio, poisonRatio, stageOf } from "@/lib/brix";

// 사과 한 알 + 당도 링.
//
// 이 피벗에서 새로 만드는 유일한 컴포넌트다. 프로필·결과·홈 요약·로그인에서
// 크기만 바꿔 재사용한다. 나무를 그리지 않은 이유는 작은 크기에서 뭉개지고
// 남과 비교하기도 어려워서다 — 사과 한 알 + 게이지가 같은 말을 더 또렷하게 한다.
//
// 링은 270°만 열린 게이지다. 길이를 dasharray로 자르지 않고 호(arc) path를
// 직접 그린다. 독사과는 "점선인데 길이도 남은 날만큼"이어야 하는데,
// dasharray는 점선 간격에 이미 쓰이고 있어 길이 자르기에 못 쓰기 때문이다.
//
// 당도 양 끝에서 사과 자체도 다르게 그린다(poison과는 별개다 — poison은
// "독사과 판정"이라는 사건이고, 아래 둘은 "지금 당도가 그 정도"라는 상태다).
//   낮은 쪽(새싹 단계) — 벌레가 파먹고 기어가는 중. 아직 안 익었다는 신호.
//   높은 쪽(고목 단계) — 황금 사과. 반짝임을 더한다.

const APPLE_PATH =
  "M50 38C38 24 14 30 14 55c0 24 22 45 36 45s36-21 36-45C86 30 62 24 50 38Z";
const STEM_PATH = "M50 38c1-11 7-17 17-19";

/** 사과 오른쪽 위를 파먹은 자리. evenodd로 APPLE_PATH와 합치면 진짜 구멍이
 *  뚫린다(뒤 배경이 카드든 바닥이든 그대로 비친다) — 배경색을 몰라도 된다. */
const BITE_PATH = "M87 40 A11 11 0 1 1 65 40 A11 11 0 1 1 87 40 Z";
/** 파먹은 자리에서 나와 아래로 기어가는 벌레. */
const WORM_BODY_PATH = "M78 43 C 84 50 70 58 80 66 C 88 72 74 78 82 84";
const WORM_HEAD = { cx: 77, cy: 42, r: 4 };

/** 황금 사과의 반짝임 두 점. */
const SPARKLES: { cx: number; cy: number; r: number }[] = [
  { cx: 32, cy: 34, r: 3.4 },
  { cx: 45, cy: 48, r: 2.1 },
];

/** 게이지가 열려 있는 각도. 시작 135°에서 시계방향으로 270°. */
const START_DEG = 135;
const SPAN_DEG = 270;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** 원호 하나를 path 문자열로. sweep이 0이면 빈 문자열(그리지 않음). */
function arc(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  if (sweepDeg <= 0) return "";
  const s = Math.min(sweepDeg, 359.99);
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, startDeg + s);
  const large = s > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function AppleGauge({
  brix,
  size = 120,
  poison = false,
  poisonDaysLeft = 0,
  className,
  label,
}: {
  brix: number;
  /** 지름(px). 64 홈 요약 / 88 빈 홈 / 120~140 프로필·결과 / 180~200 로그인 */
  size?: number;
  /** 독사과 모습으로. 링이 점선이 되고 채움이 남은 날을 나타낸다. */
  poison?: boolean;
  poisonDaysLeft?: number;
  className?: string;
  /** 읽어주는 설명. 없으면 당도로 자동 생성한다. */
  label?: string;
}) {
  const stroke = Math.max(3, size * 0.05);
  const half = size / 2;
  const r = half - stroke / 2 - 1;

  const ratio = poison ? poisonRatio(poisonDaysLeft) : gaugeRatio(brix);

  // poison(독사과 판정)이 우선이다. 아니면 지금 당도의 양 끝 단계를 본다.
  const stageName = stageOf(brix).name;
  const variant = poison ? "poison" : stageName === "새싹" ? "wormy" : stageName === "고목" ? "golden" : "normal";

  const appleFill =
    variant === "poison" ? "var(--ap-bruise)" : variant === "golden" ? "var(--ap-honey)" : "var(--ap-red)";
  const stemColor = variant === "poison" ? "var(--ap-bruise)" : "var(--ap-leaf)";

  // 사과는 viewBox 100×112 기준이라 지름의 46% 크기로 가운데 놓는다.
  const scale = (size * 0.46) / 100;
  const appleX = half - (100 * scale) / 2;
  const appleY = half - (112 * scale) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={
        label ?? (poison ? `독사과, ${poisonDaysLeft}일 남음` : `당도 ${brix.toFixed(1)} Brix`)
      }
    >
      {/* 트랙 */}
      <path
        d={arc(half, half, r, START_DEG, SPAN_DEG)}
        fill="none"
        stroke="var(--tk-line)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* 채움 */}
      <path
        d={arc(half, half, r, START_DEG, SPAN_DEG * ratio)}
        fill="none"
        stroke={poison ? "var(--ap-bruise)" : "var(--ap-honey)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={poison ? "10 9" : undefined}
        style={{ transition: "d 200ms cubic-bezier(0.4,0,0.2,1)" }}
      />
      {/* 사과 */}
      <g transform={`translate(${appleX} ${appleY}) scale(${scale})`}>
        <path
          // 벌레 먹은 사과만 파먹은 자리를 구멍으로 뚫는다(evenodd).
          // 나머지는 원래 실루엣 그대로.
          d={variant === "wormy" ? `${APPLE_PATH} ${BITE_PATH}` : APPLE_PATH}
          fillRule="evenodd"
          fill={appleFill}
          opacity={variant === "poison" ? 0.42 : 1}
        />
        <path
          d={STEM_PATH}
          fill="none"
          stroke={stemColor}
          strokeWidth={6}
          strokeLinecap="round"
          opacity={variant === "poison" ? 0.65 : 1}
        />

        {variant === "wormy" && (
          <>
            <path
              d={WORM_BODY_PATH}
              fill="none"
              stroke="var(--ap-leaf)"
              strokeWidth={5.5}
              strokeLinecap="round"
            />
            <circle
              cx={WORM_HEAD.cx}
              cy={WORM_HEAD.cy}
              r={WORM_HEAD.r}
              fill="var(--ap-leaf)"
            />
          </>
        )}

        {variant === "golden" &&
          SPARKLES.map((s, i) => (
            <path
              key={i}
              d={`M${s.cx} ${s.cy - s.r} L${s.cx + s.r} ${s.cy} L${s.cx} ${s.cy + s.r} L${s.cx - s.r} ${s.cy} Z`}
              fill="var(--tk-paper)"
              opacity={0.75}
            />
          ))}
      </g>
    </svg>
  );
}
