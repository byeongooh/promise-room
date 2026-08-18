import type { PromiseData } from "@/lib/types";

// 과거 데이터에는 카카오 ID가 prefix 없이 저장되어 있고,
// 현재 세션의 session.user.id는 "kakao:" prefix가 붙어 나온다.
// 두 형식을 동일한 사용자로 인식하기 위해 정규화한다.
export function normalizeKakaoId(id?: string | null): string | undefined {
  return id ? id.replace(/^kakao:/, "") : undefined;
}

export function isPromiseOwner(
  promise: PromiseData,
  userId?: string,
  userName?: string
): boolean {
  if (promise.creatorId) {
    return !!userId && normalizeKakaoId(promise.creatorId) === normalizeKakaoId(userId);
  }
  return !!userName && promise.creator === userName;
}

export function isPromiseParticipant(
  promise: PromiseData,
  userId?: string,
  userName?: string
): boolean {
  if (promise.participantIds?.length) {
    return !!userId && promise.participantIds.some((id) => normalizeKakaoId(id) === normalizeKakaoId(userId));
  }
  return !!userName && !!promise.participants?.includes(userName);
}

export function isPromiseFavoritedBy(promise: PromiseData, userId?: string): boolean {
  if (!promise.favoritedBy?.length) return false;
  return !!userId && promise.favoritedBy.some((id) => normalizeKakaoId(id) === normalizeKakaoId(userId));
}

// participants(v1)와 participantNames(v2)를 합쳐서 표시한다.
// (arrayRemove는 존재하지 않는 필드를 빈 배열로 만들어버리므로,
//  둘 중 하나만 보고 판단하면 다른 쪽에만 남아있는 참가자가 사라져 보일 수 있다)
export function getParticipantNames(promise: PromiseData): string[] {
  const names = [...(promise.participants ?? []), ...(promise.participantNames ?? [])];
  return Array.from(new Set(names));
}
