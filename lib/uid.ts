// 사용자 ID의 표준 형식은 "kakao:<카카오ID>" 이다.
//
// 과거 데이터와 오래된 로그인 토큰에는 접두사 없는 raw ID("4746129449")가
// 섞여 있다. 두 형식이 섞이면 본인인데도 권한 검사에 실패해 자기 약속에서
// 잠기므로, ID를 만들거나 비교하는 모든 지점은 반드시 이 파일을 거친다.

export const UID_PREFIX = "kakao:";

/** 어떤 형식이 들어와도 "kakao:<숫자>" 표준형으로 바꾼다. */
export function toCanonicalUid(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.startsWith(UID_PREFIX) ? trimmed : UID_PREFIX + trimmed;
}

/** 표준형인지 검사한다. 마이그레이션에서 잘못된 ID가 저장되는 것을 막는 용도. */
export function isCanonicalUid(value: string | null | undefined): boolean {
  return typeof value === "string" && /^kakao:\d+$/.test(value);
}

/** 두 ID가 같은 사용자인지 비교한다 (형식이 달라도 동일 판정). */
export function isSameUser(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ca = toCanonicalUid(a);
  const cb = toCanonicalUid(b);
  return !!ca && !!cb && ca === cb;
}
