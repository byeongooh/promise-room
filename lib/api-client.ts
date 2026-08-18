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
  patch: { route?: MemberRouteInput | null; status?: MemberStatus }
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
