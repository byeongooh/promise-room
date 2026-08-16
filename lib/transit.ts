import { DirectionsUnavailable, isPlausibleKoreanCoord, type Coordinate } from "@/lib/directions";

// 대중교통 길찾기 (ODsay).
//
// 카카오·네이버는 대중교통 경로를 API로 열어주지 않는다. 국내에서 대중교통
// 소요시간을 직접 계산하려면 ODsay나 TMAP을 써야 한다. ODsay를 골랐다.
//
// ODSAY_API_KEY가 없으면 대중교통 칸만 빠지고 자동차는 그대로 나온다.

const ENDPOINT = "https://api.odsay.com/v1/api/searchPubTransPathT";

export interface TransitSummary {
  /** 초 (ODsay는 분으로 준다) */
  durationSec: number;
  /** 환승 횟수 */
  transfers: number;
  /** "지하철", "버스", "버스+지하철" */
  mode: string;
  /** 요금(원). 모르면 null */
  fare: number | null;
  /** 첫 정류장/역 이름. 모르면 null */
  firstStation: string | null;
}

type OdsayPath = {
  pathType?: number;
  info?: {
    totalTime?: number;
    payment?: number;
    busTransitCount?: number;
    subwayTransitCount?: number;
    firstStartStation?: string;
  };
};

const MODE_BY_PATH_TYPE: Record<number, string> = {
  1: "지하철",
  2: "버스",
  3: "버스+지하철",
};

/** 두 좌표 사이 직선거리(m). 도시 안인지 도시 간인지 어림잡는 데 쓴다. */
function straightDistanceM(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type OdsayResult = {
  paths: OdsayPath[];
  /** 1이면 "이건 도시 안 이동이 아니다"라는 신호. 도시간으로 다시 물어봐야 한다. */
  needsIntercity: boolean;
};

async function call(
  origin: Coordinate,
  destination: Coordinate,
  key: string,
  searchType: 0 | 1
): Promise<OdsayResult> {
  const params = new URLSearchParams({
    // ODsay도 경도(X), 위도(Y) 순이다.
    SX: String(origin.lng),
    SY: String(origin.lat),
    EX: String(destination.lng),
    EY: String(destination.lat),
    OPT: "0", // 추천 순
    SearchType: String(searchType),
    apiKey: key,
  });

  const res = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
  if (!res.ok) {
    throw new DirectionsUnavailable(`ODsay 응답 ${res.status}`);
  }

  const data = (await res.json()) as {
    error?: { code?: string; msg?: string } | { code?: string; msg?: string }[];
    result?: { path?: OdsayPath[]; outTrafficCheck?: number };
  };

  if (data.error) {
    const e = Array.isArray(data.error) ? data.error[0] : data.error;
    throw new DirectionsUnavailable(`ODsay ${e?.code ?? ""} ${e?.msg ?? ""}`.trim());
  }

  return {
    paths: data.result?.path ?? [],
    needsIntercity: data.result?.outTrafficCheck === 1,
  };
}

export async function getTransitRoute(
  origin: Coordinate,
  destination: Coordinate
): Promise<TransitSummary> {
  const key = process.env.ODSAY_API_KEY;
  if (!key) throw new DirectionsUnavailable("ODSAY_API_KEY가 없습니다.");

  if (!isPlausibleKoreanCoord(origin) || !isPlausibleKoreanCoord(destination)) {
    throw new DirectionsUnavailable("좌표가 올바르지 않습니다.");
  }

  // ODsay는 도시 안(0)과 도시 간(1)을 따로 요구한다.
  //   도시 안  — 지하철·시내버스
  //   도시 간  — 고속/시외버스·기차
  // 어느 쪽인지 미리 알 수 없으므로 직선거리로 먼저 찍고, 아니면 반대쪽으로
  // 한 번 더 물어본다. 다시 물어보는 조건은 세 가지다.
  //   ① 오류가 났다  ② 경로가 하나도 없다  ③ outTrafficCheck=1 (도시 안이 아니라는 신호)
  const first: 0 | 1 = straightDistanceM(origin, destination) > 40_000 ? 1 : 0;
  const second: 0 | 1 = first === 0 ? 1 : 0;

  let paths: OdsayPath[] = [];
  try {
    const r = await call(origin, destination, key, first);
    if (r.paths.length > 0 && !r.needsIntercity) {
      paths = r.paths;
    }
  } catch {
    /* 아래에서 반대쪽으로 다시 물어본다 */
  }

  if (paths.length === 0) {
    paths = (await call(origin, destination, key, second)).paths;
  }

  const best = paths[0];
  const totalMin = best?.info?.totalTime;
  if (!best || !totalMin) {
    throw new DirectionsUnavailable("대중교통 경로를 찾지 못했습니다.");
  }

  return {
    durationSec: totalMin * 60,
    transfers: (best.info?.busTransitCount ?? 0) + (best.info?.subwayTransitCount ?? 0),
    mode: MODE_BY_PATH_TYPE[best.pathType ?? 0] ?? "대중교통",
    fare: best.info?.payment ?? null,
    firstStation: best.info?.firstStartStation ?? null,
  };
}
