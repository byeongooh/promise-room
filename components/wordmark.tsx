// 앱 이름 로고 — Appl🍎n
//
// apple + plan 합성어라, 이름 안에 사과가 실제로 들어가 있어야 뜻이 바로 읽힌다.
// 그래서 다섯 번째 글자 a를 사과 그림으로 바꿨다.
//
// 사과 path는 components/apple-gauge.tsx와 같은 것을 쓴다. 프로필의 큰 사과와
// 로고의 작은 사과가 다른 모양이면 같은 앱으로 안 보인다.
//
// 알아둘 것: 아주 작은 크기(sm)에서는 사과가 점처럼 뭉갠다. 시안에서도 이
// 방식의 약점으로 짚었던 부분이라, 앱 아이콘이나 카톡 링크 미리보기처럼
// 더 작아지는 자리에는 마크를 따로 만드는 게 낫다.

const APPLE_PATH =
  "M50 38C38 24 14 30 14 55c0 24 22 45 36 45s36-21 36-45C86 30 62 24 50 38Z";
const STEM_PATH = "M50 38c1-11 7-17 17-19";

const FONT_PX = { sm: 18, md: 24, lg: 32 } as const;

export default function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const px = FONT_PX[size];
  // 사과는 소문자 a 자리에 앉지만 대문자 높이를 넘게 잡는다.
  // x-height에 맞추면 글자 사이에 눌려 점처럼 보인다 — 로고에서는
  // 사과가 이름보다 먼저 읽혀야 해서 일부러 키웠다.
  const w = Math.round(px * 0.8);
  const h = Math.round(w * 1.12);

  return (
    <span
      className={`inline-flex items-baseline font-[family-name:var(--font-archivo)]
        font-black leading-none tracking-[-0.03em] text-[var(--tk-ink)] ${className}`}
      style={{ fontSize: px }}
      // 로고를 글자로 읽어주되, 화면에서는 사과가 a 자리를 대신한다.
      role="img"
      aria-label="Applan"
    >
      <span aria-hidden="true">Appl</span>
      <svg
        aria-hidden="true"
        width={w}
        height={h}
        viewBox="0 0 100 112"
        // items-baseline 안에서 svg는 아래 모서리가 베이스라인에 붙는다.
        // 가운데 정렬(items-center)로 두면 줄 상자 기준이라 손으로 밀어야 하는데,
        // 글자 크기가 바뀔 때마다 어긋난다. 베이스라인 정렬이 맞다.
        //
        // 음수 마진은 오버슛이다 — 둥근 글자는 네모난 글자와 바닥을 정확히
        // 맞추면 오히려 떠 보여서, 조판에서 조금 내려 앉힌다.
        // 좌우 여백은 따로 주지 않는다. viewBox(0~100) 안에서 사과가
        // x=14~86만 차지해 이미 양옆이 비어 있다.
        className="shrink-0"
        // 사과 밑동이 베이스라인에 앉도록 내린다.
        // viewBox 아래쪽 약 10.7%가 빈 칸이라 그만큼 더 내려야 실제로 닿는다.
        style={{ marginBottom: `${(-px * 0.116).toFixed(2)}px` }}
      >
        <path d={APPLE_PATH} fill="var(--ap-red)" />
        <path
          d={STEM_PATH}
          fill="none"
          stroke="var(--ap-leaf)"
          strokeWidth={9}
          strokeLinecap="round"
        />
      </svg>
      <span aria-hidden="true">n</span>
    </span>
  );
}
