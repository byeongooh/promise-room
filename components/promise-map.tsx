"use client";

import { useEffect, useRef } from "react";

// 약속 장소 지도. 경로를 넘기면 그 위에 선으로 그린다.
//
// 지도 인스턴스는 한 번만 만들고 계속 재사용한다. 경로가 바뀔 때마다
// 지도를 새로 만들면 화면이 깜빡이고 타일을 다시 받는다.

export interface RouteSegment {
  kind: "subway" | "bus" | "walk" | "car";
  label: string | null;
  color: string;
  /** [경도, 위도] */
  points: [number, number][];
}

type KakaoNS = {
  maps: {
    load: (cb: () => void) => void;
    Map: new (el: HTMLElement, opts: unknown) => KakaoMap;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoBounds;
    Marker: new (opts: unknown) => KakaoOverlay;
    InfoWindow: new (opts: unknown) => { open: (m: KakaoMap, mk: KakaoOverlay) => void; close: () => void };
    Polyline: new (opts: unknown) => KakaoOverlay;
    services?: {
      Places: new () => { keywordSearch: (kw: string, cb: (r: KakaoPlace[], s: string) => void) => void };
      Status: { OK: string };
    };
  };
};
type KakaoLatLng = object;
type KakaoBounds = { extend: (ll: KakaoLatLng) => void; isEmpty: () => boolean };
type KakaoMap = {
  setCenter: (ll: KakaoLatLng) => void;
  setLevel: (n: number) => void;
  setBounds: (b: KakaoBounds, ...padding: number[]) => void;
  relayout: () => void;
};
type KakaoOverlay = { setMap: (m: KakaoMap | null) => void };
type KakaoPlace = { x: string; y: string };

function kakaoNS(): KakaoNS | null {
  const k = (window as unknown as { kakao?: KakaoNS }).kakao;
  return k?.maps ? k : null;
}

export default function PromiseMap({
  destination,
  destinationName,
  route,
  className = "h-44 w-full overflow-hidden rounded-xl bg-[var(--tk-ground)]",
}: {
  destination: { lat: number; lng: number } | null;
  destinationName: string;
  /** 그릴 경로. null이면 목적지만 보여준다. */
  route?: RouteSegment[] | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoOverlay | null>(null);
  const linesRef = useRef<KakaoOverlay[]>([]);

  // ---------------- 지도 만들기 + 목적지 표시 ----------------
  useEffect(() => {
    const kakao = kakaoNS();
    if (!kakao || !boxRef.current) return;

    kakao.maps.load(() => {
      const box = boxRef.current;
      if (!box) return;

      if (!mapRef.current) {
        mapRef.current = new kakao.maps.Map(box, {
          center: new kakao.maps.LatLng(37.5665, 126.978),
          level: 3,
        });
      }
      const map = mapRef.current;

      const place = (lat: number, lng: number) => {
        const pos = new kakao.maps.LatLng(lat, lng);
        markerRef.current?.setMap(null);
        const marker = new kakao.maps.Marker({ map, position: pos });
        markerRef.current = marker;
        new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 8px;font-size:12px;white-space:nowrap">${destinationName}</div>`,
        }).open(map, marker);
        map.setCenter(pos);
        map.setLevel(3);
      };

      if (destination) {
        place(destination.lat, destination.lng);
        return;
      }

      // 좌표 없이 저장된 옛날 약속은 이름으로 찾아본다.
      const services = kakao.maps.services;
      if (!services || !destinationName) return;
      new services.Places().keywordSearch(destinationName, (result, status) => {
        if (status !== services.Status.OK || !result?.length) return;
        place(Number(result[0].y), Number(result[0].x));
      });
    });
  }, [destination, destinationName]);

  // ---------------- 경로 그리기 ----------------
  useEffect(() => {
    const kakao = kakaoNS();
    const map = mapRef.current;
    if (!kakao || !map) return;

    // 이전 경로는 지운다.
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];

    if (!route || route.length === 0) {
      // 경로를 끄면 목적지 중심으로 되돌린다.
      if (destination) {
        map.setCenter(new kakao.maps.LatLng(destination.lat, destination.lng));
        map.setLevel(3);
      }
      return;
    }

    const bounds = new kakao.maps.LatLngBounds();

    for (const seg of route) {
      const path = seg.points.map(([lng, lat]) => {
        const ll = new kakao.maps.LatLng(lat, lng);
        bounds.extend(ll);
        return ll;
      });
      if (path.length < 2) continue;

      // 선 아래에 흰 테두리를 한 겹 깔면 지도 위에서 훨씬 잘 보인다.
      if (seg.kind !== "walk") {
        const casing = new kakao.maps.Polyline({
          map,
          path,
          strokeWeight: 9,
          strokeColor: "#FFFFFF",
          strokeOpacity: 0.9,
        });
        linesRef.current.push(casing);
      }

      const line = new kakao.maps.Polyline({
        map,
        path,
        strokeWeight: seg.kind === "walk" ? 4 : 5,
        strokeColor: seg.color,
        strokeOpacity: seg.kind === "walk" ? 0.85 : 1,
        strokeStyle: seg.kind === "walk" ? "shortdash" : "solid",
      });
      linesRef.current.push(line);
    }

    if (!bounds.isEmpty()) map.setBounds(bounds, 24, 24, 24, 24);
  }, [route, destination]);

  return <div ref={boxRef} className={className} />;
}
