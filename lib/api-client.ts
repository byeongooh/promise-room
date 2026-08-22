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
  /** 빈 문자열이면 "날짜 정하는 중". time과 같이 비워야 한다. */
  date: string;
  time: string;
  /** 빈 문자열이면 "장소 정하는 중". 온라인 플랜은 애초에 안 쓴다. */
  location: string;
  meetingMode?: "inPerson" | "online";
  /** 온라인 플랜의 참여 링크. */
  meetingUrl?: string | null;
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
    /**
     * "나는 오늘 몇 시까지 가요" — "HH:mm"만 보낸다. 날짜를 붙이는 건 서버가
     * 한다(브라우저 시간대에 따라 하루가 밀리는 것을 막으려고).
     * null이면 지운다 = 약속 시각에 맞춰 온다는 뜻으로 되돌린다.
     */
    arrivalTime?: string | null;
    /** 이번 플랜에 갈지. 방에서 나가는 것과는 다르다 — 명단에는 남는다. */
    attendance?: "going" | "cant";
    absenceReason?: string | null;
    /** "이 장소면 가기 어려워요". null이면 거둔다. */
    placeObjection?: string | null;
  }
) {
  return request<{ ok: true; leaveAt: string | null; arrivalAt: string | null }>(
    `/api/promises/${promiseId}/me`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

// ---------------------------------------------------------------- 확정

/**
 * 플랜을 확정하거나 되돌린다. 만든 사람만.
 * 되돌려도 날짜·장소는 지워지지 않는다 — 다시 정하는 중 화면에서 고치면 된다.
 */
export function setPlanConfirmed(promiseId: string, confirmed: boolean) {
  return request<{ ok: true; confirmedAt: string | null }>(
    `/api/promises/${promiseId}/confirm`,
    { method: confirmed ? "POST" : "DELETE" }
  );
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
  place: PlaceInput & { placeId?: string | null; meetingUrl?: string | null }
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

// ---------------------------------------------------------------- 날짜 맞추기

import type { DateOption, DateVote } from "@/lib/types";

/** 날짜 후보 올리기. 올린 사람은 자동으로 "돼요"에 들어간다. */
export function addDateOption(promiseId: string, input: { date: string; time: string }) {
  return request<DateOption>(`/api/promises/${promiseId}/dates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** 이 날짜에 올 수 있는지 답하기. 다시 누르면 갈아 끼워진다. */
export function voteDateOption(promiseId: string, optionId: string, vote: DateVote) {
  return request<{ ok: true }>(`/api/promises/${promiseId}/dates`, {
    method: "PATCH",
    body: JSON.stringify({ optionId, vote }),
  });
}

/** 날짜 확정 — 만든 사람만. 참여자들의 출발 시각이 여기서 처음 생긴다. */
export function confirmDate(promiseId: string, input: { date: string; time: string }) {
  return request<{ recalculated: number }>(`/api/promises/${promiseId}/dates`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** 후보 거두기. 올린 본인 또는 만든 사람. */
export function removeDateOption(promiseId: string, optionId: string) {
  return request<{ ok: true }>(
    `/api/promises/${promiseId}/dates?id=${encodeURIComponent(optionId)}`,
    { method: "DELETE" }
  );
}

// ---------------------------------------------------------------- 달력 메모

import type { CalendarNote } from "@/lib/types";

/**
 * 내 달력 메모 전부.
 *
 * 이것만 읽기도 서버를 거친다. 다른 화면은 Firestore를 직접 구독하는데,
 * 메모는 나만 쓰고 나만 봐서 실시간일 이유가 없다. 서버로 돌리면 users/
 * 보안 규칙을 새로 배포하지 않아도 된다(사람이 직접 해야 하는 일).
 */
export function fetchNotes() {
  return request<{ notes: CalendarNote[] }>("/api/notes", { method: "GET" });
}

export function addNote(date: string, text: string, promiseId?: string | null) {
  return request<{ note: CalendarNote }>("/api/notes", {
    method: "POST",
    body: JSON.stringify({ date, text, promiseId: promiseId ?? null }),
  });
}

export function removeNote(id: string) {
  return request<{ ok: true }>("/api/notes", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

/** 챙겼는지 표시. 약속에 딸린 체크리스트에서 쓴다. */
export function setNoteDone(id: string, done: boolean) {
  return request<{ ok: true }>("/api/notes", {
    method: "PATCH",
    body: JSON.stringify({ id, done }),
  });
}

// ---------------------------------------------------------------- 수확

import type { HarvestVote, UserApple } from "@/lib/types";
import type { HarvestState } from "@/lib/harvest-service";

/**
 * 이 플랜의 수확 상태.
 *
 * **부르는 것만으로 정산이 일어날 수 있다.** 자동으로 도는 작업이 없어서
 * "전원이 냈다"를 알아챌 계기가 누군가 열어보는 것뿐이다(서버 주석 참고).
 */
export function fetchHarvest(promiseId: string) {
  return request<{ harvest: HarvestState }>(`/api/promises/${promiseId}/harvest`, {
    method: "GET",
  });
}

/** 표를 낸다. 한 번 내면 못 바꾼다. */
export function submitHarvest(promiseId: string, votes: Record<string, HarvestVote>) {
  return request<{ harvest: HarvestState }>(`/api/promises/${promiseId}/harvest`, {
    method: "POST",
    body: JSON.stringify({ votes }),
  });
}

/** 내 당도와 독사과. users/ 는 클라이언트가 못 읽어서 서버를 거친다. */
export function fetchMyApple() {
  return request<{ apple: UserApple }>("/api/me/apple", { method: "GET" });
}
