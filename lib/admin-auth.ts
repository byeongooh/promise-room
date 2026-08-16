import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";

// 테스트용 관리자 세션.
//
// 이 화면은 앱의 보안 모델(참여자만 열람)을 의도적으로 우회한다.
// 지인들이 테스트하는 걸 지켜보기 위한 도구이므로 다음을 지킨다:
//   - 비밀번호는 해시로만 둔다 (평문은 저장소·코드 어디에도 없다)
//   - 세션은 httpOnly 쿠키라 브라우저 스크립트가 읽을 수 없다
//   - 관리자 화면은 읽기 전용
//   - Firestore 보안 규칙은 건드리지 않는다. 서버가 Admin SDK로 읽어 내려준다

const COOKIE = "pr_admin";
const MAX_AGE_SEC = 8 * 60 * 60; // 8시간

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET missing");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** "만료시각.서명" 형태의 토큰 */
function issueToken(): string {
  const exp = String(Date.now() + MAX_AGE_SEC * 1000);
  return `${exp}.${sign(exp)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return Number(exp) > Date.now();
}

export async function startAdminSession(): Promise<void> {
  (await cookies()).set(COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  return isValidToken((await cookies()).get(COOKIE)?.value);
}
