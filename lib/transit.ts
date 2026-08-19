import { DirectionsUnavailable, isPlausibleKoreanCoord, type Coordinate } from "@/lib/directions";

// 대중교통 길찾기 (ODsay).
//
// 카카오·네이버는 대중교통 경로를 API로 열어주지 않는다. 국내에서 대중교통
// 소요시간을 직접 계산하려면 ODsay나 TMAP을 써야 한다. ODsay를 골랐다.
//
// ODSAY_API_KEY가 없으면 대중교통 칸만 빠지고 자동차는 그대로 나온다.

const ENDPOINT = "https://api.odsay.com/v1/api/searchPubTransPathT";

/** ODsay에 등록해둔 주소. 다른 도메인을 쓰게 되면 환경변수로 바꾼다. */
function registeredOrigin(): string {
  return (
    process.env.ODSAY_REGISTERED_URI ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

/** 경로 안의 한 단계. "5531번 버스로 9정거장" 같은 것. */
export interface TransitStep {
  kind: "subway" | "bus" | "walk";
  /**
   * 탈 수 있는 것들. 같은 정류장에서 같은 곳으로 가는 버스가 여럿이면
   * ["5531", "51", "5623"]처럼 함께 들어간다. 걷는 단계는 빈 배열.
   */
  names: string[];
  /** 지하철 호선색. 걷기·버스는 null */
  color: string | null;
  from: string | null;
  to: string | null;
  /** 타는 곳·내리는 곳 좌표 [경도, 위도]. 지도에 점을 찍는 데 쓴다. */
  fromPos: [number, number] | null;
  toPos: [number, number] | null;
  /** 정거장 수. 걷는 단계는 null */
  stops: number | null;
  minutes: number;
}

export interface TransitOption {
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
  /** 이 경로를 지도에 그릴 때 필요한 열쇠. 없으면 그릴 수 없다. */
  mapObj: string | null;
  /** 무엇을 타고 어디서 갈아타는지 */
  steps: TransitStep[];
}

type OdsayPath = {
  pathType?: number;
  info?: {
    totalTime?: number;
    /** 도시 안 */
    payment?: number;
    busTransitCount?: number;
    subwayTransitCount?: number;
    /** 도시 간 — 이름이 다르다 */
    totalPayment?: number;
    transitCount?: number;
    firstStartStation?: string;
    /** 실제로 이동하는 거리(m). 목적지까지 가는 경로인지 가늠하는 데 쓴다. */
    totalDistance?: number;
    /** 노선 좌표를 받아올 때 쓰는 열쇠 */
    mapObj?: string;
  };
  subPath?: {
    trafficType?: number;
    sectionTime?: number;
    stationCount?: number;
    startName?: string;
    endName?: string;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    lane?: { name?: string; busNo?: string; subwayCode?: number }[];
  }[];
};

// 수도권 전철 노선색. lib/transit-lane.ts와 같은 표를 쓴다.
const SUBWAY_COLOR: Record<string, string> = {
  "1호선": "#0052A4",
  "2호선": "#00A84D",
  "3호선": "#EF7C1C",
  "4호선": "#00A5DE",
  "5호선": "#996CAC",
  "6호선": "#CD7C2F",
  "7호선": "#747F00",
  "8호선": "#E6186C",
  "9호선": "#BB8336",
  신분당선: "#D4003B",
  공항철도: "#0090D2",
  경의중앙선: "#77C4A3",
  경춘선: "#0C8E72",
  "수인.분당선": "#FABE00",
  수인분당선: "#FABE00",
  우이신설선: "#B7C452",
  서해선: "#8FC31F",
  김포골드라인: "#A17800",
  신림선: "#6789CA",
  경강선: "#0054A6",
};

/** "수도권 2호선" → "2호선". 앞에 붙는 지역명은 화면에서 자리만 먹는다. */
function shortLineName(raw: string): string {
  return raw.replace(/^(수도권|부산|대구|광주|대전)\s*/, "").trim();
}

// 구간의 교통수단. 경로 종류(pathType)는 도시 안(1~3)과 도시 간(11~13)이
// 따로 놀아서, 구간 정보로 이름을 만드는 편이 확실하다.
const TRAFFIC_LABEL: Record<number, string> = {
  1: "지하철",
  2: "버스",
  // 3은 도보. 어느 경로에나 끼어 있어 이름에 넣지 않는다.
  4: "기차",
  5: "고속버스",
  6: "시외버스",
  7: "항공",
  8: "해운",
};

// 비행기와 배는 빼고 보여준다. 공항·항구까지 가는 시간이 빠져 있어
// "서울→부산 65분" 같은 숫자가 나오는데, 약속 시간을 이걸로 잡으면 큰일 난다.
const EXCLUDED_TRAFFIC = new Set([7, 8]);

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
};

/**
 * call()이 실패하면 한 번 더 시도한다. ODsay가 가끔 일시적으로 빈 응답을
 * 주는 걸 실제로 봤다(방금까지 통하던 좌표 조합이 다음 요청에 0건으로
 * 돌아온 적 있음). 두 번 다 실패하면 그때는 진짜 원인을 로그에 남기고
 * 포기한다 — 전에는 여기서 조용히 빈 배열로 삼켜서, 진짜 API 오류인지
 * 그냥 경로가 없는지 로그만 보고는 구분할 수 없었다.
 */
async function callWithRetry(
  origin: Coordinate,
  destination: Coordinate,
  key: string,
  searchType: 0 | 1
): Promise<OdsayResult> {
  try {
    return await call(origin, destination, key, searchType);
  } catch {
    try {
      return await call(origin, destination, key, searchType);
    } catch (err) {
      console.warn(
        `[transit] ODsay ${searchType === 0 ? "도시 안" : "도시 간"} 호출 두 번 다 실패:`,
        (err as Error).message
      );
      return { paths: [] };
    }
  }
}

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

  // ODsay 애플리케이션을 URI 방식으로 등록했다면, 어느 사이트에서 부르는지를
  // Referer로 확인한다. 서버에서 부르는 요청에는 Referer가 없으므로 직접 붙인다.
  // (Server 방식은 공인 IP 고정을 요구하는데, Vercel은 요청마다 IP가 달라
  //  이 프로젝트에서는 쓸 수 없다.)
  //
  // User-Agent도 같이 붙인다. Node의 기본 fetch는 이 값을 "node"로 보내는데,
  // 배포된 링크(Vercel)에서만 이 호출이 "ODsay 500"으로 반복해서 실패하고
  // 로컬에서 같은 좌표로 부르면 바로 되는 걸 실제로 봤다. 리전을 서울로
  // 옮겨도 재현돼서 지연 문제는 아니었다 — "node"라는 값 자체가 서버·봇
  // 요청이라는 걸 그대로 드러내서, ODsay 앞단의 방어 로직이 이걸 다르게
  // 다루고 있을 가능성이 크다. 브라우저 값으로 바꿔 우선 확인해본다.
  const referer = registeredOrigin();
  const res = await fetch(`${ENDPOINT}?${params}`, {
    cache: "no-store",
    headers: {
      Referer: referer,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    // 응답 본문과 우리가 실제로 보낸 Referer를 같이 남긴다.
    // 배포판에서만 500이 반복되는데 상태 코드만 봐서는 원인을 좁힐 수 없었다.
    // ODsay는 보통 200 + 본문의 error 객체로 실패를 알리므로, 500이 온다는 건
    // ODsay 앞단(또는 우리가 잘못 보낸 값) 쪽 문제일 가능성이 크다.
    // 키는 절대 찍지 않는다 — 본문에도 섞여 있을 수 있어 앞부분만 자른다.
    const body = await res.text().catch(() => "(본문 읽기 실패)");
    throw new DirectionsUnavailable(
      `ODsay 응답 ${res.status} · referer=${referer} · body=${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    error?: { code?: string; msg?: string } | { code?: string; msg?: string }[];
    result?: { path?: OdsayPath[] };
  };

  if (data.error) {
    // 에러 객체를 통째로 남긴다. code/msg만 뽑아 쓰다가 msg가 비어 있어
    // "ODsay 500"이라는 코드 하나만 남았고, 그걸 HTTP 500으로 착각해
    // 리전·User-Agent를 애먼 데를 고쳤다. 필드 이름이 msg가 아닐 수도 있다.
    throw new DirectionsUnavailable(
      `ODsay 오류 referer=${referer} error=${JSON.stringify(data.error).slice(0, 300)}`
    );
  }

  return { paths: data.result?.path ?? [] };
}

function toOption(path: OdsayPath): TransitOption | null {
  const info = path.info;
  const totalMin = info?.totalTime;
  if (!totalMin) return null;

  // 도보(3)를 뺀 실제 교통수단들. 중복은 없앤다.
  const types = [
    ...new Set((path.subPath ?? []).map((s) => s.trafficType).filter((t): t is number => !!t && t !== 3)),
  ];
  if (types.some((t) => EXCLUDED_TRAFFIC.has(t))) return null;

  const mode = types.map((t) => TRAFFIC_LABEL[t]).filter(Boolean).join("+") || "대중교통";

  // 도시 안과 도시 간이 서로 다른 이름을 쓴다.
  const fare = info.payment ?? info.totalPayment ?? null;
  const transfers =
    info.busTransitCount !== undefined || info.subwayTransitCount !== undefined
      ? (info.busTransitCount ?? 0) + (info.subwayTransitCount ?? 0)
      : (info.transitCount ?? 1) - 1; // 도시 간은 "탄 횟수"라 1을 뺀다

  return {
    durationSec: totalMin * 60,
    transfers: Math.max(0, transfers),
    mode,
    fare: fare && fare > 0 ? fare : null,
    firstStation: info.firstStartStation ?? null,
    mapObj: info.mapObj ?? null,
    steps: toSteps(path),
  };
}

/** 구간 목록을 화면에 뿌릴 단계로 바꾼다. */
function toSteps(path: OdsayPath): TransitStep[] {
  const steps: TransitStep[] = [];

  for (const s of path.subPath ?? []) {
    const minutes = s.sectionTime ?? 0;

    if (s.trafficType === 3) {
      // 0분·0m짜리 환승 통로는 단계로 세면 화면만 길어진다.
      if (minutes > 0) {
        steps.push({
          kind: "walk",
          names: [],
          color: null,
          from: null,
          to: null,
          fromPos: null,
          toPos: null,
          stops: null,
          minutes,
        });
      }
      continue;
    }

    const lane = s.lane?.[0];
    const isSubway = s.trafficType === 1;
    const name = isSubway
      ? lane?.name
        ? shortLineName(lane.name)
        : "전철"
      : (lane?.busNo ?? "버스");

    steps.push({
      kind: isSubway ? "subway" : "bus",
      names: [name],
      color: isSubway ? (SUBWAY_COLOR[name] ?? null) : null,
      from: s.startName ?? null,
      to: s.endName ?? null,
      fromPos:
        Number.isFinite(s.startX) && Number.isFinite(s.startY)
          ? [s.startX as number, s.startY as number]
          : null,
      toPos:
        Number.isFinite(s.endX) && Number.isFinite(s.endY)
          ? [s.endX as number, s.endY as number]
          : null,
      stops: s.stationCount ?? null,
      minutes,
    });
  }

  return steps;
}

/**
 * 대중교통 경로 후보를 빠른 순으로 최대 6개 돌려준다.
 * 방식(지하철/버스/섞어서)이 골고루 섞이도록 방식별 제일 빠른 것을 먼저
 * 세우고, 남는 자리를 빠른 순으로 채운다.
 */
export async function getTransitRoutes(
  origin: Coordinate,
  destination: Coordinate
): Promise<TransitOption[]> {
  const key = process.env.ODSAY_API_KEY;
  if (!key) throw new DirectionsUnavailable("ODSAY_API_KEY가 없습니다.");

  if (!isPlausibleKoreanCoord(origin) || !isPlausibleKoreanCoord(destination)) {
    throw new DirectionsUnavailable("좌표가 올바르지 않습니다.");
  }

  // ODsay는 검색을 둘로 나눈다.
  //   도시 안(0) — 지하철·시내버스. 출발지에서 목적지까지 끝까지 안내한다.
  //   도시 간(1) — 기차·고속/시외버스. 역과 역 사이만 안내한다.
  //
  // 도시 안은 언제나 부른다. 도시 간은 정말 먼 거리일 때만 보탠다.
  //
  // 도시 간을 가까운 거리에 섞으면 안 된다. 안양(19km)에서 잠실을 물었더니
  // "안양→영등포 기차 11분", "안양→서울역 기차 23분"을 준다. 잠실에 가지도
  // 않는 경로다. 역까지 가고 역에서 나오는 시간이 빠져 있어 늘 짧게 나오고,
  // 이동 거리로도 걸러지지 않는다(서울역행은 직선거리보다 오히려 길다).
  //
  // 반대로 서울→대전을 도시 안으로만 보면 "시내버스 252분"이 나온다.
  // 그래서 먼 거리에서는 둘 다 봐야 한다.
  const straight = straightDistanceM(origin, destination);
  const FAR = 40_000;

  const [inCity, intercity] = await Promise.all([
    callWithRetry(origin, destination, key, 0),
    straight > FAR
      ? callWithRetry(origin, destination, key, 1)
      : Promise.resolve({ paths: [] as OdsayPath[] }),
  ]);

  const paths = [...inCity.paths, ...intercity.paths];

  const options = paths
    .map(toOption)
    .filter((o): o is TransitOption => o !== null)
    .sort((a, b) => a.durationSec - b.durationSec);

  if (options.length === 0) {
    throw new DirectionsUnavailable("대중교통 경로를 찾지 못했습니다.");
  }

  // ODsay는 같은 길에 버스 번호만 다른 경로를 여러 개 준다(5531/51/5623…).
  // 사용자에게는 같은 경로이므로 하나로 묶고, 탈 수 있는 번호를 모아 붙인다.
  // 어디서 타고 어디서 내리는지가 같으면 같은 경로로 본다.
  const shapeOf = (o: TransitOption) =>
    o.steps
      .filter((s) => s.kind !== "walk")
      .map((s) => `${s.kind}:${s.from}>${s.to}`)
      .join("|");

  const byShape = new Map<string, TransitOption>();
  for (const o of options) {
    const shape = shapeOf(o);
    const kept = byShape.get(shape);
    if (!kept) {
      byShape.set(shape, o);
      continue;
    }
    // 이미 있는 경로에 이번 번호를 보탠다.
    const ridden = o.steps.filter((s) => s.kind !== "walk");
    kept.steps
      .filter((s) => s.kind !== "walk")
      .forEach((step, i) => {
        for (const name of ridden[i]?.names ?? []) {
          if (!step.names.includes(name)) step.names.push(name);
        }
      });
  }

  const unique = [...byShape.values()];

  // 방식이 골고루 보이도록 방식별 제일 빠른 것을 먼저 세우고,
  // 남는 자리를 빠른 순으로 채운다.
  const picked: TransitOption[] = [];
  const takenModes = new Set<string>();
  for (const o of unique) {
    if (takenModes.has(o.mode)) continue;
    takenModes.add(o.mode);
    picked.push(o);
  }
  for (const o of unique) {
    if (picked.length >= 6) break;
    if (!picked.includes(o)) picked.push(o);
  }

  return picked.sort((a, b) => a.durationSec - b.durationSec).slice(0, 6);
}
