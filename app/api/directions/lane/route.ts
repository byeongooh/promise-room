import { NextResponse } from "next/server";

import { badRequest, withCaller } from "@/lib/api-guard";
import { DirectionsUnavailable, type Coordinate } from "@/lib/directions";
import { getRouteSegments } from "@/lib/transit-lane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 고른 대중교통 경로를 지도에 그릴 좌표로 바꿔 준다.
// 목록을 받을 때 미리 다 불러오면 경로 수만큼 호출이 나가므로,
// 사용자가 하나를 고른 뒤에 그때 부른다.

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
  const body = (await req.json().catch(() => null)) as {
    mapObj?: unknown;
    origin?: unknown;
    destination?: unknown;
  } | null;

  const mapObj = typeof body?.mapObj === "string" ? body.mapObj : "";
  if (!mapObj) throw badRequest("경로 정보가 없습니다.");

  const origin = readCoord(body?.origin, "출발지");
  const destination = readCoord(body?.destination, "도착지");

  try {
    const segments = await getRouteSegments(mapObj, origin, destination);
    return NextResponse.json({ segments }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof DirectionsUnavailable) {
      console.warn("[directions/lane] 사용할 수 없음:", err.message);
      return NextResponse.json({ segments: null }, { headers: { "Cache-Control": "no-store" } });
    }
    throw err;
  }
});
