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

/** 지도에 찍는 점. 승차·환승·하차처럼 "여기서 뭘 해야 하는 곳". */
export interface RoutePoint {
  kind: "origin" | "board" | "transfer" | "alight";
  /** "5531 승차", "2호선 환승" 처럼 무엇을 하는지 */
  label: string;
  /** 정류장·역 이름 */
  sublabel?: string | null;
  color: string;
  /** [경도, 위도] */
  position: [number, number];
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
    CustomOverlay: new (opts: unknown) => KakaoOverlay;
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

/** 승차·환승·하차 점 하나의 생김새. 지도 위에서 확실히 눈에 띄어야 한다. */
function pointMarkup(p: RoutePoint): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const sub = p.sublabel
    ? `<span style="display:block;font-size:10.5px;color:#5A6784;margin-top:1px">${escape(p.sublabel)}</span>`
    : "";

  return `
    <div style="display:flex;align-items:center;gap:6px;transform:translate(-9px,-50%);white-space:nowrap">
      <span style="width:18px;height:18px;border-radius:50%;background:${p.color};
                   border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);flex:none"></span>
      <span style="background:#fff;border-radius:8px;padding:4px 8px;
                   box-shadow:0 2px 8px rgba(22,35,63,.25);line-height:1.25">
        <span style="display:block;font-size:11.5px;font-weight:800;color:#16233F">${escape(p.label)}</span>
        ${sub}
      </span>
    </div>`;
}

export default function PromiseMap({
  destination,
  destinationName,
  route,
  points,
  className = "h-44 w-full overflow-hidden rounded-xl bg-[var(--tk-ground)]",
}: {
  destination: { lat: number; lng: number } | null;
  destinationName: string;
  /** 그릴 경로. null이면 목적지만 보여준다. */
  route?: RouteSegment[] | null;
  /** 승차·환승·하차 점 */
  points?: RoutePoint[] | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoOverlay | null>(null);
  const linesRef = useRef<KakaoOverlay[]>([]);
  const pointsRef = useRef<KakaoOverlay[]>([]);
  /** 마지막으로 맞춘 화면 범위. 상자 크기가 바뀐 뒤 다시 맞추는 데 쓴다. */
  const boundsRef = useRef<KakaoBounds | null>(null);

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
      const casing = new kakao.maps.Polyline({
        map,
        path,
        strokeWeight: seg.kind === "walk" ? 8 : 13,
        strokeColor: "#FFFFFF",
        strokeOpacity: 0.95,
      });
      linesRef.current.push(casing);

      const line = new kakao.maps.Polyline({
        map,
        path,
        strokeWeight: seg.kind === "walk" ? 5 : 8,
        strokeColor: seg.color,
        strokeOpacity: 1,
        strokeStyle: seg.kind === "walk" ? "shortdash" : "solid",
      });
      linesRef.current.push(line);
    }

    if (!bounds.isEmpty()) {
      map.setBounds(bounds, 30, 30, 30, 30);
      boundsRef.current = bounds;
    } else {
      boundsRef.current = null;
    }
  }, [route, destination]);

  // ---------------- 상자 크기가 바뀌면 다시 그리기 ----------------
  //
  // 카카오 지도는 컨테이너 크기를 스스로 지켜보지 않는다. 경로를 고르면
  // 이 상자가 176px에서 352px로 커지는데, 그때 relayout()을 불러주지 않으면
  // 늘어난 아래쪽이 빈 칸으로 남는다. 마우스 휠을 굴리면 지도가 스스로
  // 다시 그려서 "돌아온 것처럼" 보이던 게 이 증상이다.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      // 높이가 CSS transition으로 변하는 동안 수십 번 불린다.
      // 프레임당 한 번으로 묶어서 마지막 크기에만 반응하게 한다.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kakao = kakaoNS();
        const map = mapRef.current;
        if (!kakao || !map) return;

        map.relayout();

        // relayout만 하면 보던 자리가 어긋난다. 그리던 경로가 있으면 다시
        // 맞추고, 없으면 목적지를 가운데로 되돌린다.
        const b = boundsRef.current;
        if (b && !b.isEmpty()) {
          map.setBounds(b, 30, 30, 30, 30);
        } else if (destination) {
          map.setCenter(new kakao.maps.LatLng(destination.lat, destination.lng));
        }
      });
    });

    ro.observe(box);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [destination]);

  // ---------------- 승차·환승·하차 점 ----------------
  useEffect(() => {
    const kakao = kakaoNS();
    const map = mapRef.current;
    if (!kakao || !map) return;

    pointsRef.current.forEach((o) => o.setMap(null));
    pointsRef.current = [];
    if (!points?.length) return;

    for (const p of points) {
      const overlay = new kakao.maps.CustomOverlay({
        map,
        position: new kakao.maps.LatLng(p.position[1], p.position[0]),
        content: pointMarkup(p),
        // 선 위에 오도록 올린다.
        zIndex: 5,
        // 기본값은 가운데 정렬이라 라벨이 점을 가린다. 왼쪽 기준으로 붙인다.
        xAnchor: 0,
        yAnchor: 0.5,
      });
      pointsRef.current.push(overlay);
    }
  }, [points]);

  return <div ref={boxRef} className={className} />;
}
