"use client";

import { useEffect, useRef, useState } from "react";

export type PickedLocation = {
  text: string;
  lat: number;
  lng: number;
  placeId?: string;
};

type Props = {
  onSelect: (loc: PickedLocation) => void;
  initialKeyword?: string;
};

export default function LocationPicker({ onSelect, initialKeyword = "" }: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  // ✅ 카카오 맵/마커 인스턴스를 ref로 들고있기 (window 저장 방식보다 안정적)
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [keyword, setKeyword] = useState(initialKeyword);
  const [statusText, setStatusText] = useState(
    "지도를 클릭하거나 검색해서 장소를 선택하세요."
  );

  // ✅ 지도 초기화
  useEffect(() => {
    const kakao = (window as any).kakao;
    if (!kakao?.maps) {
      setStatusText("Kakao 지도 SDK가 아직 로드되지 않았습니다. (layout.tsx Script 확인)");
      return;
    }

    kakao.maps.load(() => {
      if (!mapDivRef.current) return;

      // 이미 초기화 됐으면 중복 생성 방지
      if (mapRef.current && markerRef.current) {
        // 혹시 레이아웃 문제로 안 보일 때 대비
        try {
          mapRef.current.relayout?.();
        } catch {}
        return;
      }

      const map = new kakao.maps.Map(mapDivRef.current, {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 4,
      });

      const marker = new kakao.maps.Marker({ map });

      mapRef.current = map;
      markerRef.current = marker;

      // ✅ 지도 클릭으로 선택
      kakao.maps.event.addListener(map, "click", (mouseEvent: any) => {
        const latlng = mouseEvent.latLng;
        const lat = latlng.getLat();
        const lng = latlng.getLng();

        marker.setPosition(latlng);

        const loc: PickedLocation = {
          text: `(${lat.toFixed(6)}, ${lng.toFixed(6)})`,
          lat,
          lng,
        };

        onSelect(loc);
        setStatusText(`선택됨: ${loc.text}`);
      });

      // ✅ 초기 렌더 후 relayout (크기 계산 이슈 방지)
      setTimeout(() => {
        try {
          map.relayout?.();
        } catch {}
      }, 0);
    });
  }, [onSelect]);

  // ✅ 검색 처리
  const handleSearch = () => {
    const kakao = (window as any).kakao;
    const map = mapRef.current;
    const marker = markerRef.current;

    if (!kakao?.maps || !map || !marker) {
      setStatusText("지도 준비가 아직 안 됐습니다.");
      return;
    }

    const q = keyword.trim();
    if (!q) return;

    // services 라이브러리 필요 (layout.tsx에서 libraries=services 확인)
    if (!kakao.maps.services?.Places) {
      setStatusText("Places 서비스가 없습니다. Script에 libraries=services 확인");
      return;
    }

    const places = new kakao.maps.services.Places();

    places.keywordSearch(q, (result: any, status: any) => {
      if (status !== kakao.maps.services.Status.OK || !result?.length) {
        setStatusText("검색 결과가 없습니다.");
        return;
      }

      const first = result[0];

      const lat = Number(first.y);
      const lng = Number(first.x);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setStatusText("좌표 변환 실패");
        return;
      }

      const pos = new kakao.maps.LatLng(lat, lng);

      // ✅ 핵심: 지도 이동 + 마커 이동
      marker.setPosition(pos);

      // relayout 먼저 해주면 setCenter가 안정적으로 먹힘(특히 레이아웃 변경 시)
      try {
        map.relayout?.();
      } catch {}

      map.setCenter(pos);
      map.setLevel(3);

      const loc: PickedLocation = {
        text: first.place_name || q,
        lat,
        lng,
        placeId: first.id,
      };

      onSelect(loc);
      setStatusText(`선택됨: ${loc.text}`);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="장소 검색 (예: 석수역, 가천대학교)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
        />
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm"
          onClick={handleSearch}
        >
          검색
        </button>
      </div>

      <div
        ref={mapDivRef}
        className="w-full h-64 rounded-md border bg-muted"
        style={{ minHeight: "260px" }}
      />

      <p className="text-xs text-muted-foreground">{statusText}</p>
    </div>
  );
}
