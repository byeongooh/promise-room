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
  penalty: string;
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
