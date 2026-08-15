"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

export type PickedLocation = {
  text: string;
  lat: number;
  lng: number;
  placeId?: string;
};

type Place = {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
};

type Props = {
  onSelect: (loc: PickedLocation) => void;
  initialKeyword?: string;
};

export default function LocationPicker({ onSelect, initialKeyword = "" }: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [keyword, setKeyword] = useState(initialKeyword);
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---------------- 지도 초기화 ----------------
  useEffect(() => {
    const kakao = (window as any).kakao;
    if (!kakao?.maps) {
      setNotice("지도를 불러오지 못했습니다. 새로고침해 주세요.");
      return;
    }

    kakao.maps.load(() => {
      if (!mapDivRef.current) return;
      if (mapRef.current && markerRef.current) {
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

      // 지도를 직접 눌러도 고를 수 있다 (이름 없는 장소용)
      kakao.maps.event.addListener(map, "click", (e: any) => {
        const latlng = e.latLng;
        const lat = latlng.getLat();
        const lng = latlng.getLng();
        marker.setPosition(latlng);

        // 누른 지점의 주소를 받아와 좌표 대신 사람이 읽을 수 있는 값으로 저장한다
        const geocoder = kakao.maps.services?.Geocoder
          ? new kakao.maps.services.Geocoder()
          : null;

        const finish = (text: string) => {
          setPicked(text);
          setResults(null);
          onSelect({ text, lat, lng });
        };

        if (geocoder) {
          geocoder.coord2Address(lng, lat, (res: any, status: any) => {
            const ok = status === kakao.maps.services.Status.OK && res?.[0];
            const addr = ok
              ? res[0].road_address?.address_name || res[0].address?.address_name
              : null;
            finish(addr || `지도에서 고른 위치`);
          });
        } else {
          finish("지도에서 고른 위치");
        }
      });

      setTimeout(() => {
        try {
          map.relayout?.();
        } catch {}
      }, 0);
    });
  }, [onSelect]);

  // ---------------- 검색 ----------------
  const runSearch = useCallback((q: string) => {
    const kakao = (window as any).kakao;
    if (!kakao?.maps?.services?.Places) return;

    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }

    const toPlace = (p: any): Place => ({
      id: p.id,
      name: p.place_name,
      address: p.road_address_name || p.address_name || "",
      category: p.category_group_name || "",
      lat: Number(p.y),
      lng: Number(p.x),
    });

    const places = new kakao.maps.services.Places();
    setSearching(true);

    // 지금 보고 있는 지도 주변을 먼저 찾는다.
    // 위치 기준 없이 검색하면 "가천"에 경북 가천면이 먼저 나오는 식으로
    // 엉뚱한 지역이 잡힌다.
    const center = mapRef.current?.getCenter?.();

    const nationwide = () =>
      places.keywordSearch(trimmed, (res: any[], status: any) => {
        setSearching(false);
        setResults(
          status === kakao.maps.services.Status.OK && res?.length
            ? res.slice(0, 8).map(toPlace)
            : []
        );
      });

    if (!center) {
      nationwide();
      return;
    }

    places.keywordSearch(
      trimmed,
      (res: any[], status: any) => {
        const near =
          status === kakao.maps.services.Status.OK && res?.length ? res.map(toPlace) : [];

        // 주변에 마땅한 게 없으면 범위를 풀어 다시 찾는다
        if (near.length < 3) {
          nationwide();
          return;
        }
        setSearching(false);
        setResults(near.slice(0, 8));
      },
      { location: center, radius: 20000, sort: kakao.maps.services.SortBy.ACCURACY }
    );
  }, []);

  // 결과를 골라 검색창에 이름을 채울 때는 그게 다시 검색을 부르면 안 된다
  const skipNextSearch = useRef(false);

  // 입력이 멈추면 자동으로 검색한다 (카카오맵처럼 연관 결과가 뜨도록)
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const t = setTimeout(() => runSearch(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword, runSearch]);

  // ---------------- 결과 선택 ----------------
  const choose = (p: Place) => {
    const kakao = (window as any).kakao;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!kakao?.maps || !map || !marker) return;

    const pos = new kakao.maps.LatLng(p.lat, p.lng);
    marker.setPosition(pos);
    try {
      map.relayout?.();
    } catch {}
    map.setCenter(pos);
    map.setLevel(3);

    skipNextSearch.current = true;
    setPicked(p.name);
    setResults(null);
    setKeyword(p.name);
    onSelect({ text: p.name, lat: p.lat, lng: p.lng, placeId: p.id });
  };

  return (
    <div className="space-y-2.5">
      {/* 검색창 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--tk-faint)]" />
        <input
          className="tk-meta h-11 w-full rounded-xl border border-[var(--tk-line)] bg-[var(--tk-paper)]
            pl-10 pr-10 text-[var(--tk-ink)] outline-none
            placeholder:text-[var(--tk-faint)]
            focus:border-[var(--tk-gold)] focus:ring-2 focus:ring-[var(--tk-gold)]/25"
          placeholder="장소를 검색하세요"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch(keyword);
            }
            if (e.key === "Escape") setResults(null);
          }}
          autoComplete="off"
        />
        {keyword && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setKeyword("");
              setResults(null);
            }}
            className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center
              rounded-full text-[var(--tk-faint)] hover:bg-[var(--tk-ground)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* 검색 결과 — 여기서 골라야 엉뚱한 곳이 잡히지 않는다 */}
      {results !== null && (
        <div className="overflow-hidden rounded-xl border border-[var(--tk-line)] bg-[var(--tk-paper)]">
          {results.length === 0 ? (
            <p className="tk-meta px-3.5 py-3 text-[var(--tk-faint)]">
              {searching ? "찾는 중…" : "검색 결과가 없습니다."}
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p)}
                    className="flex w-full items-start gap-2.5 border-b border-[var(--tk-line)]/60 px-3.5 py-2.5
                      text-left last:border-b-0 hover:bg-[var(--tk-ground)]"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--tk-faint)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-[var(--tk-ink)]">
                        {p.name}
                      </span>
                      {p.address && (
                        <span className="tk-caption block truncate text-[var(--tk-faint)]">
                          {p.address}
                          {p.category ? ` · ${p.category}` : ""}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        ref={mapDivRef}
        className="h-56 w-full overflow-hidden rounded-xl border border-[var(--tk-line)] bg-[var(--tk-ground)]"
      />

      <p className="tk-caption text-[var(--tk-faint)]">
        {notice ?? (picked ? `선택됨 · ${picked}` : "검색해서 고르거나, 지도를 눌러 직접 지정할 수 있어요.")}
      </p>
    </div>
  );
}
