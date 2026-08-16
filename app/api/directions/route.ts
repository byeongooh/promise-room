import { NextResponse } from "next/server";

import { badRequest, withCaller } from "@/lib/api-guard";
import { getCarRoute, type Coordinate } from "@/lib/directions";
import { getTransitRoute } from "@/lib/transit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 출발지 → 약속 장소 소요시간. 자동차와 대중교통을 한 번에 돌려준다.
//
// 두 곳(카카오모빌리티 / ODsay)을 부르는데, 한쪽이 실패해도 다른 쪽은
// 보여줘야 하므로 각각 따로 감싼다. 실패는 오류가 아니라 null이다.
//
// 키는 서버에만 둔다. 브라우저에서 직접 부르면 키가 노출되고
// 남이 우리 쿼터를 대신 써버린다. 로그인한 사람만 부를 수 있다.

function readCoord(value: unknown, field: string): Coordinate {
  const c = value as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw badRequest(`${field} 좌표가 없습니다.`);
  }
  return { lat, lng };
}

/** 실패를 null로 삼킨다. 한쪽 길찾기가 죽어도 화면은 나머지를 보여준다. */
async function orNull<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    console.warn(`[directions] ${label} 사용할 수 없음:`, (err as Error).message);
    return null;
  }
}

export const POST = withCaller(async (_caller, req) => {
  const body = await req.json().catch(() => null);
  const origin = readCoord((body as { origin?: unknown })?.origin, "출발지");
  const destination = readCoord((body as { destination?: unknown })?.destination, "도착지");

  const [car, transit] = await Promise.all([
    orNull("자동차", () => getCarRoute(origin, destination)),
    orNull("대중교통", () => getTransitRoute(origin, destination)),
  ]);

  return NextResponse.json({ car, transit }, { headers: { "Cache-Control": "no-store" } });
});
