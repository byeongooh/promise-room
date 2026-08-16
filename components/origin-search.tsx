"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

// 출발지를 검색해서 바로 쓰는 칸.
//
// 저장해두는 장소(집·회사)와 달리 한 번 쓰고 마는 검색이다. 지도 앱처럼
// 치면 바로 후보가 뜨고 고르면 끝난다. 저장은 고른 뒤에 따로 할 수 있다.

export interface FoundPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

type KakaoPlaceRaw = {
  place_name: string;
  road_address_name?: string;
  address_name?: string;
  x: string;
  y: string;
};

type Places = {
  keywordSearch: (
    keyword: string,
    cb: (data: KakaoPlaceRaw[], status: string) => void,
    opts?: Record<string, unknown>
  ) => void;
};

type KakaoNS = {
  maps: {
    load: (cb: () => void) => void;
    services?: { Places: new () => Places; Status: { OK: string } };
  };
};

export default function OriginSearch({
  onPick,
  placeholder = "출발지 검색",
}: {
  onPick: (place: FoundPlace) => void;
  placeholder?: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<FoundPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 결과에서 하나를 고르면 검색어가 그 이름으로 바뀌는데,
  // 그것 때문에 검색이 또 돌지 않게 한 번 건너뛴다.
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }

    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setNotice(null);
      return;
    }

    // 글자마다 부르면 낭비다. 잠깐 멈췄을 때만 찾는다.
    const timer = setTimeout(() => {
      const kakao = (window as unknown as { kakao?: KakaoNS }).kakao;
      if (!kakao?.maps) {
        setNotice("지도를 불러오지 못했습니다. 새로고침해 주세요.");
        return;
      }

      kakao.maps.load(() => {
        const services = kakao.maps.services;
        if (!services) {
          setNotice("장소 검색을 쓸 수 없습니다.");
          return;
        }

        setSearching(true);
        new services.Places().keywordSearch(trimmed, (data, status) => {
          setSearching(false);
          if (status !== services.Status.OK || !data?.length) {
            setResults([]);
            setNotice("검색 결과가 없습니다.");
            return;
          }
          setNotice(null);
          setResults(
            data.slice(0, 8).map((p) => ({
              name: p.place_name,
              address: p.road_address_name || p.address_name || "",
              lat: Number(p.y),
              lng: Number(p.x),
            }))
          );
        });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [keyword]);

  const choose = (place: FoundPlace) => {
    skipNext.current = true;
    setKeyword(place.name);
    setResults(null);
    setNotice(null);
    onPick(place);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-[var(--tk-ground)] px-3.5">
        <Search className="size-4 shrink-0 text-[var(--tk-faint)]" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--tk-ink)]
            outline-none placeholder:text-[var(--tk-faint)]"
        />
        {searching && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--tk-faint)]" />}
        {keyword && !searching && (
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setResults(null);
              setNotice(null);
            }}
            aria-label="지우기"
            className="shrink-0 text-[var(--tk-faint)] hover:text-[var(--tk-sub)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {notice && <p className="tk-caption mt-1.5 text-[var(--tk-faint)]">{notice}</p>}

      {results && results.length > 0 && (
        <ul
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl
            bg-[var(--tk-paper)] py-1 shadow-lg ring-1 ring-black/10"
        >
          {results.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="w-full px-3.5 py-2.5 text-left transition hover:bg-[var(--tk-ground)]"
              >
                <span className="tk-meta block truncate font-medium text-[var(--tk-ink)]">
                  {r.name}
                </span>
                {r.address && (
                  <span className="tk-caption block truncate text-[var(--tk-faint)]">
                    {r.address}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
