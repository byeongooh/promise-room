"use client";

// 내가 지정해둔 출발지(집·회사 등).
//
// 지금은 이 브라우저에만 저장한다. 서버에 두려면 사용자 문서와 보안 규칙을
// 새로 만들어야 하는데, 최종 목표가 앱이라 그 작업은 앱으로 옮길 때 한 번에 한다.
// 그래서 지금은 폰을 바꾸면 다시 넣어야 한다 — 그때까지의 임시 저장소다.

const KEY = "promise-room:my-places:v1";

export interface MyPlace {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

function read(): MyPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 저장 형식이 바뀌었거나 손상된 항목은 조용히 버린다.
    return parsed.filter(
      (p): p is MyPlace =>
        !!p &&
        typeof (p as MyPlace).id === "string" &&
        typeof (p as MyPlace).label === "string" &&
        Number.isFinite((p as MyPlace).lat) &&
        Number.isFinite((p as MyPlace).lng)
    );
  } catch {
    return [];
  }
}

function write(places: MyPlace[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    /* 저장 공간이 꽉 찬 경우. 이번 화면에서는 그냥 못 저장한 채로 둔다. */
  }
}

export function listMyPlaces(): MyPlace[] {
  return read();
}

export function addMyPlace(place: Omit<MyPlace, "id">): MyPlace {
  const saved: MyPlace = { ...place, id: `p_${Date.now().toString(36)}` };
  write([...read(), saved]);
  return saved;
}

export function removeMyPlace(id: string): void {
  write(read().filter((p) => p.id !== id));
}
