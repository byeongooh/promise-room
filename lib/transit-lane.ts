import { DirectionsUnavailable, readApiKey, type Coordinate, type OdsayError } from "@/lib/directions";

// 대중교통 경로를 지도에 그릴 좌표로 바꾼다 (ODsay loadLane).
//
// searchPubTransPathT가 준 mapObj를 넘기면 노선 좌표가 온다.
// 걷는 구간은 좌표를 주지 않으므로, 노선과 노선 사이를 직선으로 잇는다.
// 실제 인도를 따라가는 선은 아니지만 "여기서 저기까지 걸어간다"는 보인다.

const ENDPOINT = "https://api.odsay.com/v1/api/loadLane";

/** 지도에 그릴 한 구간 */
export interface RouteSegment {
  kind: "subway" | "bus" | "walk";
  /** 노선 이름. "2호선" 같은 것. 걷는 구간은 null */
  label: string | null;
  color: string;
  /** [경도, 위도] */
  points: [number, number][];
}

// 수도권 전철 노선색. 없는 노선은 회색으로 둔다.
const SUBWAY_COLOR: Record<number, { name: string; color: string }> = {
  1: { name: "1호선", color: "#0052A4" },
  2: { name: "2호선", color: "#00A84D" },
  3: { name: "3호선", color: "#EF7C1C" },
  4: { name: "4호선", color: "#00A5DE" },
  5: { name: "5호선", color: "#996CAC" },
  6: { name: "6호선", color: "#CD7C2F" },
  7: { name: "7호선", color: "#747F00" },
  8: { name: "8호선", color: "#E6186C" },
  9: { name: "9호선", color: "#BB8336" },
  100: { name: "신분당선", color: "#D4003B" },
  101: { name: "공항철도", color: "#0090D2" },
  104: { name: "경의중앙선", color: "#77C4A3" },
  107: { name: "에버라인", color: "#6FB245" },
  108: { name: "경춘선", color: "#0C8E72" },
  109: { name: "신분당선", color: "#D4003B" },
  110: { name: "의정부경전철", color: "#FDA600" },
  112: { name: "경강선", color: "#0054A6" },
  113: { name: "우이신설선", color: "#B7C452" },
  114: { name: "서해선", color: "#8FC31F" },
  115: { name: "김포골드라인", color: "#A17800" },
  116: { name: "수인분당선", color: "#FABE00" },
  117: { name: "신림선", color: "#6789CA" },
};

const BUS_COLOR = "#2C5FE0";
const WALK_COLOR = "#8894AE";
const FALLBACK_COLOR = "#5A6784";

type OdsayLane = {
  /** 1=버스, 2=지하철 */
  class?: number;
  /** 지하철이면 호선 번호, 버스면 버스 종류 */
  type?: number;
  section?: { graphPos?: { x: number; y: number }[] }[];
};

function toPoints(lane: OdsayLane): [number, number][] {
  const out: [number, number][] = [];
  for (const s of lane.section ?? []) {
    for (const p of s.graphPos ?? []) out.push([p.x, p.y]);
  }
  return out;
}

export async function getRouteSegments(
  mapObj: string,
  origin: Coordinate,
  destination: Coordinate
): Promise<RouteSegment[]> {
  const key = readApiKey("ODSAY_API_KEY");
  if (!key) throw new DirectionsUnavailable("ODSAY_API_KEY가 없습니다.");

  const params = new URLSearchParams({
    // 0:0@ 은 ODsay가 요구하는 접두사다.
    mapObject: `0:0@${mapObj}`,
    apiKey: key,
  });

  // User-Agent를 붙이는 이유는 lib/transit.ts의 같은 fetch 호출에 적어둔 것과 같다.
  const res = await fetch(`${ENDPOINT}?${params}`, {
    cache: "no-store",
    headers: {
      Referer: process.env.ODSAY_REGISTERED_URI ?? "https://promise-room.vercel.app",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new DirectionsUnavailable(`ODsay 응답 ${res.status}`);

  const data = (await res.json()) as {
    error?: OdsayError | OdsayError[];
    result?: { lane?: OdsayLane[] };
  };
  if (data.error) {
    const e = Array.isArray(data.error) ? data.error[0] : data.error;
    // message가 진짜 이유를 담는다. msg만 읽으면 코드만 남아 원인을 못 본다.
    throw new DirectionsUnavailable(`ODsay ${e?.code ?? ""} ${e?.message ?? e?.msg ?? ""}`.trim());
  }

  const lanes = (data.result?.lane ?? []).map((lane) => {
    const points = toPoints(lane);
    if (lane.class === 2) {
      const line = SUBWAY_COLOR[lane.type ?? -1];
      return {
        kind: "subway" as const,
        label: line?.name ?? "전철",
        color: line?.color ?? FALLBACK_COLOR,
        points,
      };
    }
    return { kind: "bus" as const, label: "버스", color: BUS_COLOR, points };
  });

  const withPoints = lanes.filter((l) => l.points.length > 1);
  if (withPoints.length === 0) throw new DirectionsUnavailable("노선 좌표가 비어 있습니다.");

  // 걷는 구간을 채운다: 출발지 → 첫 노선, 노선과 노선 사이, 마지막 노선 → 목적지.
  const segments: RouteSegment[] = [];
  const walk = (from: [number, number], to: [number, number]): RouteSegment => ({
    kind: "walk",
    label: null,
    color: WALK_COLOR,
    points: [from, to],
  });

  let cursor: [number, number] = [origin.lng, origin.lat];
  for (const lane of withPoints) {
    segments.push(walk(cursor, lane.points[0]));
    segments.push(lane);
    cursor = lane.points[lane.points.length - 1];
  }
  segments.push(walk(cursor, [destination.lng, destination.lat]));

  // 거의 제자리인 도보(환승 통로 등)는 선으로 그려봐야 점만 찍힌다.
  return segments.filter((s) => s.kind !== "walk" || roughDistance(s.points) > 30);
}

/** 도(degree) 차이를 미터로 대충 바꾼다. 짧은 구간 판별용이라 정확할 필요는 없다. */
function roughDistance(points: [number, number][]): number {
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  return Math.hypot((bx - ax) * 88_000, (by - ay) * 111_000);
}
