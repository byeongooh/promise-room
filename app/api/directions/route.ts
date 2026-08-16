import { NextResponse } from "next/server";

import { badRequest, withCaller } from "@/lib/api-guard";
import { DirectionsUnavailable, getCarRoute, type Coordinate } from "@/lib/directions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 출발지 → 약속 장소 소요시간.
//
// 카카오 REST 키는 서버에만 둔다. 브라우저에서 직접 부르면 키가 노출되고,
// 남이 우리 쿼터를 대신 써버릴 수 있다.
// 로그인한 사람만 부를 수 있게 막아둔다(withCaller).

function readCoord(value: unknown, field: string): Coordinate {
  const c = value as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw badRequest(`${field} 좌표가 없습니다.`);
  }
  return { lat, lng };
}

export const POST = withCaller(async (_caller, req) => {
  const body = await req.json().catch(() => null);
  const origin = readCoord((body as { origin?: unknown })?.origin, "출발지");
  const destination = readCoord((body as { destination?: unknown })?.destination, "도착지");

  try {
    const route = await getCarRoute(origin, destination);
    return NextResponse.json(route, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof DirectionsUnavailable) {
      // 키가 없거나 길을 못 찾은 경우다. 화면에서는 소요시간만 숨기면 되므로
      // 오류가 아니라 "모름"으로 내려보낸다.
      console.warn("[directions] 사용할 수 없음:", err.message);
      return NextResponse.json(
        { unavailable: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    throw err;
  }
});
