// 로그인 화면 배경 두 가지.
// 그림 위에 글씨가 얹히므로 위아래를 부드럽게 덮어(scrim) 읽기를 지킨다.
// 장식일 뿐이라 스크린리더에는 잡히지 않게 한다.

// 이 앱은 폰 화면을 기준으로 그렸다. 그림을 화면 폭에 그대로 맞추면
// PC처럼 넓은 화면에서 티켓이 길게 늘어나고 지도가 확대돼 버린다.
// 그래서 그림은 폰 폭(아래 값)의 기둥 안에서만 그리고, 양옆은 배경색으로 흘려보낸다.
const COLUMN = "min(100%, 30rem)";

/** 그림이 놓이는 기둥. 양옆 경계가 드러나지 않게 좌우를 서서히 지운다. */
function ArtColumn({ children }: { children: React.ReactNode }) {
  const fade = "linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="relative mx-auto h-full overflow-hidden"
        style={{ width: COLUMN, maskImage: fade, WebkitMaskImage: fade }}
      >
        {children}
      </div>
    </div>
  );
}

/** 03 — 흐린 티켓이 흩뿌려진 배경 */
export function TicketPatternBackground() {
  // 기둥 안에서의 위치라 %로 잡아도 안전하다.
  type Scatter = {
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
    width: string;
    rotate: number;
    opacity: number;
  };
  // 로그인 뭉치가 화면 아래쪽을 차지하므로 티켓은 위쪽 60% 안에 고르게 흩는다.
  const tickets: Scatter[] = [
    { left: "-15%", top: "4%", width: "72%", rotate: -11, opacity: 0.5 },
    { right: "-17%", top: "19%", width: "70%", rotate: 9, opacity: 0.45 },
    { left: "-12%", top: "35%", width: "74%", rotate: 6, opacity: 0.4 },
    { right: "-14%", top: "50%", width: "66%", rotate: -7, opacity: 0.32 },
  ];

  return (
    <ArtColumn>
      {tickets.map((t, i) => (
        <div
          key={i}
          style={{
            left: t.left,
            right: t.right,
            top: t.top,
            bottom: t.bottom,
            width: t.width,
            opacity: t.opacity,
            transform: `rotate(${t.rotate}deg)`,
          }}
          className="absolute grid grid-cols-[minmax(0,1fr)_3.6rem] overflow-hidden
            rounded-xl bg-[var(--tk-paper)] shadow-sm"
        >
          <div className="space-y-2 p-3.5">
            <div className="h-[11px] w-[60%] rounded bg-[var(--tk-ground)]" />
            <div className="h-[10px] w-[42%] rounded bg-[var(--tk-ground)]" />
          </div>
          <div className="border-l-2 border-dashed border-[var(--tk-line)]" />
        </div>
      ))}

      {/* 글씨가 놓이는 아래쪽을 덮는다 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--tk-ground) 0%, transparent 16%," +
            " transparent 52%, var(--tk-ground) 78%)",
        }}
      />
    </ArtColumn>
  );
}

/** 06 — 도시 지도 배경. 실제 지도가 아니라 그림이다. */
export function CityMapBackground() {
  // 도로는 바깥선을 굵게 깔고 그 위에 안쪽 선을 덧그려 두께를 만든다.
  const roads: [string, number, number][] = [
    ["M-20 258 C 90 250, 210 244, 360 232", 17, 12],
    ["M118 -20 C 132 160, 140 380, 128 756", 19, 14],
    ["M-20 470 C 100 452, 230 436, 360 402", 15, 10],
    ["M228 -20 C 236 90, 236 190, 214 300 C 198 386, 210 500, 236 756", 11, 7],
    ["M-20 120 C 60 116, 96 112, 150 108", 8, 4.5],
    ["M-20 350 C 70 344, 150 340, 200 336", 8, 4.5],
    ["M60 -20 L 72 260", 7, 3.5],
    ["M-20 610 C 80 596, 170 580, 300 548", 8, 4.5],
  ];

  const blocks: [number, number, number, number][] = [
    [16, 96, 52, 40], [76, 88, 34, 52], [18, 150, 40, 58], [66, 158, 46, 34],
    [150, 120, 40, 44], [20, 300, 46, 36], [76, 292, 30, 48], [196, 286, 44, 38],
    [252, 296, 34, 30], [24, 420, 52, 42], [88, 432, 36, 30], [212, 392, 48, 36],
    [274, 404, 30, 26], [30, 560, 42, 34], [238, 620, 44, 34],
  ];

  return (
    <ArtColumn>
      <svg
        viewBox="0 0 340 736"
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        <rect width="340" height="736" fill="var(--map-ground)" />

        {/* 강 */}
        <path
          d="M-30 640 C 60 600, 90 520, 180 505 C 260 492, 300 430, 380 415 L 380 500
             C 305 512, 270 570, 195 585 C 120 600, 90 660, 10 700 Z"
          fill="var(--map-water)"
        />
        <path
          d="M-30 640 C 60 600, 90 520, 180 505 C 260 492, 300 430, 380 415"
          stroke="var(--map-water-line)"
          strokeWidth="1.5"
          fill="none"
        />

        {/* 공원 */}
        <path
          d="M232 70 C 290 58, 342 84, 348 132 C 354 182, 316 214, 268 210
             C 224 206, 200 172, 204 128 C 207 96, 214 74, 232 70 Z"
          fill="var(--map-park)"
        />
        <path
          d="M250 104 C 268 96, 292 104, 300 124"
          stroke="var(--map-park-line)"
          strokeWidth="2"
          fill="none"
        />
        <circle cx="243" cy="150" r="7" fill="var(--map-park-line)" />
        <circle cx="290" cy="168" r="5" fill="var(--map-park-line)" />

        {/* 건물 블록 */}
        <g fill="var(--map-block)">
          {blocks.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="3" />
          ))}
        </g>

        {/* 도로 — 바깥선 먼저, 안쪽 선을 덧그린다 */}
        <g stroke="var(--map-casing)" fill="none" strokeLinecap="round">
          {roads.map(([d, outer], i) => (
            <path key={i} d={d} strokeWidth={outer} />
          ))}
        </g>
        <g stroke="var(--map-road)" fill="none" strokeLinecap="round">
          {roads.map(([d, , inner], i) => (
            <path key={i} d={d} strokeWidth={inner} />
          ))}
        </g>

        {/* 간선도로 중앙선 */}
        <path
          d="M118 -20 C 132 160, 140 380, 128 756"
          stroke="var(--map-center)"
          strokeWidth="1.6"
          fill="none"
          strokeDasharray="7 7"
          opacity="0.75"
        />
      </svg>

      {/* 목적지 핀 — 글씨를 피해 위쪽 3분의 1 지점에 둔다 */}
      <span className="absolute left-[46%] top-[30%]">
        <span
          className="absolute -left-[18px] -top-[18px] grid size-9 place-items-center
            rounded-full bg-[var(--tk-gold)] text-[16px]"
          style={{
            boxShadow:
              "0 0 0 8px rgba(245,179,1,.20), 0 0 0 18px rgba(245,179,1,.10)," +
              " 0 4px 10px rgba(22,35,63,.18)",
          }}
        >
          📍
        </span>
      </span>

      {/* 글씨가 놓이는 아래쪽을 덮어 읽기를 지킨다 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--tk-ground) 94%, transparent) 0%," +
            " color-mix(in srgb, var(--tk-ground) 35%, transparent) 26%," +
            " color-mix(in srgb, var(--tk-ground) 15%, transparent) 44%," +
            " color-mix(in srgb, var(--tk-ground) 92%, transparent) 68%," +
            " var(--tk-ground) 82%)",
        }}
      />
    </ArtColumn>
  );
}
