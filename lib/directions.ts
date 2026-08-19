import { badRequest } from "@/lib/api-guard";

// 카카오모빌리티 자동차 길찾기.
//
// 한국은 지도 데이터 반출 규제 때문에 구글 길찾기가 제대로 동작하지 않는다.
// 그래서 국내 서비스를 쓴다. 카카오 로그인에 쓰는 앱의 REST 키를 그대로 쓴다.
//
// 주의: 이 API는 자동차만 계산한다. 대중교통 경로는 카카오가 API로 열어주지
// 않아서, 대중교통은 카카오맵 앱으로 넘기는 방식으로 처리한다.

const ENDPOINT = "https://apis-navi.kakaomobility.com/v1/directions";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteSummary {
  /** 초 */
  durationSec: number;
  /** 미터 */
  distanceM: number;
  /** 지도에 그릴 경로. [경도, 위도] 순서다. */
  path: [number, number][];
}

export class DirectionsUnavailable extends Error {}

/** 좌표가 대한민국 안에 있는지 대충 확인한다. 엉뚱한 값으로 API를 부르지 않기 위함. */
export function isPlausibleKoreanCoord(c: Coordinate): boolean {
  return (
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat > 32 &&
    c.lat < 40 &&
    c.lng > 124 &&
    c.lng < 132
  );
}

export async function getCarRoute(
  origin: Coordinate,
  destination: Coordinate
): Promise<RouteSummary> {
  // 카카오 로그인의 client_id가 곧 그 앱의 REST API 키라서 이미 갖고 있는 값을 쓴다.
  // 나중에 길찾기용 앱을 따로 팔 수도 있으니 전용 변수를 먼저 본다.
  const key = readApiKey("KAKAO_REST_API_KEY") ?? readApiKey("KAKAO_CLIENT_ID");
  if (!key) {
    throw new DirectionsUnavailable("카카오 REST 키가 설정되지 않았습니다.");
  }

  if (!isPlausibleKoreanCoord(origin) || !isPlausibleKoreanCoord(destination)) {
    throw badRequest("좌표가 올바르지 않습니다.");
  }

  // 카카오는 경도,위도(x,y) 순서로 받는다. 위도,경도로 보내면 조용히 엉뚱한 답이 온다.
  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority: "RECOMMEND",
    car_fuel: "GASOLINE",
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    // 길은 계속 바뀌므로 캐시하지 않는다.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DirectionsUnavailable(`카카오 응답 ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    routes?: {
      result_code?: number;
      result_msg?: string;
      summary?: { duration?: number; distance?: number };
      sections?: { roads?: { vertexes?: number[] }[] }[];
    }[];
  };

  const route = data.routes?.[0];
  // result_code 0이 성공. 길을 못 찾으면 0이 아닌 코드와 사유가 온다.
  if (!route || route.result_code !== 0 || !route.summary) {
    throw new DirectionsUnavailable(route?.result_msg ?? "경로를 찾지 못했습니다.");
  }

  // 도로 조각마다 좌표가 [x1,y1,x2,y2,…] 한 줄로 들어 있다. 짝지어 편다.
  const path: [number, number][] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) path.push([v[i], v[i + 1]]);
    }
  }

  return {
    durationSec: route.summary.duration ?? 0,
    distanceM: route.summary.distance ?? 0,
    path,
  };
}

/**
 * ODsay가 실패를 알리는 방식. HTTP는 200으로 오고 본문에 이것이 들어 있다.
 *
 * 메시지 필드는 `message`다. 예전에 `msg`로 읽고 있어서 "[ApiKeyAuthFailed]
 * ApiKey authentication failed." 같은 정작 중요한 문장이 통째로 사라지고
 * 코드 "500"만 로그에 남았다. 그걸 HTTP 500으로 착각해 리전·User-Agent 등
 * 엉뚱한 곳을 두 번이나 고쳤다. 그래서 타입으로 못박아 둔다.
 */
export type OdsayError = { code?: string; message?: string; msg?: string };

/**
 * 환경변수에서 API 키를 읽되 앞뒤 공백을 떼어낸다.
 *
 * 실제로 데인 곳이다. Vercel에 ODsay 키를 붙여넣을 때 맨 앞에 탭 문자가
 * 하나 딸려 들어가 22자짜리 키가 23자가 되었고, ODsay는 이걸
 * "[ApiKeyAuthFailed] ApiKey authentication failed."로 거절했다.
 * 로컬 .env.local의 키는 멀쩡해서 로컬만 되고 배포판만 안 되는,
 * 원인 짐작이 어려운 증상으로 나타났다.
 *
 * 콘솔에서 값을 다시 저장하는 게 근본 해결이지만, 눈에 안 보이는 공백은
 * 언제든 다시 섞인다. 코드가 견디는 편이 낫다.
 */
export function readApiKey(name: string): string | undefined {
  const raw = process.env[name];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * ODsay 요청에 붙일 Referer.
 *
 * **배포 도메인과 무관하다.** ODsay 콘솔에 URI 방식으로 등록해둔 주소와
 * 글자 그대로 같아야 하고, 그건 우리가 지금 어느 도메인에 떠 있는지와는
 * 상관없는 값이다.
 *
 * 예전에는 이 값을 VERCEL_PROJECT_PRODUCTION_URL에서 자동으로 만들었다.
 * 그러면 Vercel 프로젝트 이름을 바꾸는 순간 Referer가 조용히 따라 바뀌고,
 * ODsay는 등록되지 않은 주소라며 인증을 거절한다 — 도메인을 바꾼 것과
 * 대중교통이 죽은 것이 연결돼 보이지 않아 원인을 찾기 아주 어렵다.
 * (실제로 이와 같은 종류의 인증 실패로 한참 헤맸다. CLAUDE.md의
 *  "ODsay에서 크게 데인 것" 6·7번 참고.)
 *
 * 그래서 자동 감지를 없앴다. 바꾸려면 두 곳을 같이 바꾼다:
 *   1. ODsay 콘솔(lab.odsay.com)의 등록 URI
 *   2. 환경변수 ODSAY_REGISTERED_URI (또는 아래 기본값)
 */
export function odsayReferer(): string {
  // 기본값 = 지금 ODsay에 등록되어 있는 주소.
  return readApiKey("ODSAY_REGISTERED_URI") ?? "https://promise-room.vercel.app";
}
