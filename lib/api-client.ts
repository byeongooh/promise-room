// 화면에서 쓰는 서버 API 호출 모음.
// 모든 쓰기는 Firestore 직접 호출이 아니라 이 함수들을 거친다.

export interface PromiseSummary {
  id: string;
  title: string;
  creatorName: string | null;
  alreadyParticipant: boolean;
}

/** 서버가 내려준 사용자용 메시지를 담는 오류. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body?.error ?? "UNKNOWN",
      body?.message ?? "요청을 처리하지 못했습니다."
    );
  }
  return body as T;
}

export interface CreatePromiseInput {
  title: string;
  date: string;
  time: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string | null;
  password: string;
}

export function createPromise(input: CreatePromiseInput) {
  return request<{ id: string }>("/api/promises", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchPromiseSummary(promiseId: string) {
  return request<PromiseSummary>(`/api/promises/${promiseId}/summary`);
}

export function joinPromise(promiseId: string, password: string) {
  return request<{ ok: true }>(`/api/promises/${promiseId}/join`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function leavePromise(promiseId: string) {
  return request<{ ok: true }>(`/api/promises/${promiseId}/leave`, { method: "POST" });
}

export function deletePromise(promiseId: string) {
  return request<{ ok: true }>(`/api/promises/${promiseId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------- 내 상태

export interface MemberRouteInput {
  kind: "car" | "transit";
  label: string;
  durationSec: number;
  origin: { label: string; lat: number; lng: number };
  mapObj?: string | null;
  transfers?: number | null;
  fare?: number | null;
  firstStation?: string | null;
}

export type MemberStatus = "unknown" | "onway" | "arrived";

/**
 * 이 약속에서의 내 상태를 바꾼다. 대상은 항상 로그인한 본인이라 uid를 보내지 않는다.
 * route에 null을 주면 "고른 경로 지우기"이고, 아예 넘기지 않으면 경로는 그대로 둔다.
 */
export function updateMyMember(
  promiseId: string,
  patch: {
    route?: MemberRouteInput | null;
    status?: MemberStatus;
    /** 경로를 고르지 않아도 출발지만 정해둘 수 있다. */
    origin?: { label: string; lat: number; lng: number } | null;
  }
) {
  return request<{ ok: true; leaveAt: string | null }>(`/api/promises/${promiseId}/me`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ---------------------------------------------------------------- 즐겨찾기

export function setPromiseFavorite(promiseId: string, favorite: boolean) {
  return request<{ ok: true }>(`/api/promises/${promiseId}/favorite`, {
    method: "PATCH",
    body: JSON.stringify({ favorite }),
  });
}

// ---------------------------------------------------------------- 약속 장소

import type { PlaceCheck, PlaceSummary, PlaceSuggestion } from "@/lib/types";

export interface PlaceInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * 후보 장소 하나를 계산해본다. 아무것도 바꾸지 않는다.
 *
 * 참여자 수만큼 외부 길찾기 API를 부르므로(ODsay 하루 1천 건) 자동으로
 * 부르지 말 것. 사용자가 후보를 고른 순간에만 부른다.
 */
export function checkPlace(promiseId: string, place: PlaceInput) {
  return request<PlaceCheck>(`/api/promises/${promiseId}/place`, {
    method: "POST",
    body: JSON.stringify(place),
  });
}

/** 약속 장소를 실제로 바꾼다. 만든 사람만. 참여자들의 출발 시각도 다시 계산된다. */
export function changePlace(
  promiseId: string,
  place: PlaceInput & { placeId?: string | null }
) {
  return request<{ recalculated: number }>(`/api/promises/${promiseId}/place`, {
    method: "PATCH",
    body: JSON.stringify(place),
  });
}

/** 계산해본 곳을 만든 사람에게 제안한다. 방금 잰 요약을 같이 보낸다. */
export function suggestPlace(promiseId: string, place: PlaceInput, summary: PlaceSummary) {
  return request<PlaceSuggestion>(`/api/promises/${promiseId}/place/suggestions`, {
    method: "POST",
    body: JSON.stringify({ ...place, summary }),
  });
}

/** 제안 거두기. 올린 본인 또는 만든 사람. */
export function removePlaceSuggestion(promiseId: string, suggestionId: string) {
  return request<{ ok: true }>(
    `/api/promises/${promiseId}/place/suggestions?id=${encodeURIComponent(suggestionId)}`,
    { method: "DELETE" }
  );
}
