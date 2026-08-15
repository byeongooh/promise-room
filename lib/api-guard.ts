import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { admin } from "@/lib/firebaseAdmin";
import { toCanonicalUid } from "@/lib/uid";

// 모든 쓰기 API의 인증 관문.
//
// 두 가지 방식을 지원한다:
//   1) Authorization: Bearer <Firebase ID 토큰>  — 향후 React Native 앱용
//   2) NextAuth 세션 쿠키                        — 현재 웹앱용
// 덕분에 나중에 모바일 앱이 같은 API를 그대로 쓸 수 있다.

export interface Caller {
  uid: string;
  name: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
export const forbidden = (msg?: string) => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg?: string) => new ApiError(404, "NOT_FOUND", msg);
export const badRequest = (msg?: string) => new ApiError(400, "BAD_REQUEST", msg);

/** 요청자를 식별한다. 실패하면 ApiError(401)을 던진다. */
export async function getCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    const idToken = header.slice(7).trim();
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = toCanonicalUid(decoded.uid);
      if (!uid) throw unauthorized();
      const dname = decoded.dname;
      return { uid, name: typeof dname === "string" ? dname : (decoded.name ?? null) };
    } catch {
      throw unauthorized();
    }
  }

  const session = await getServerSession(authOptions);
  const uid = toCanonicalUid(session?.user?.id);
  if (!uid) throw unauthorized();

  return { uid, name: session?.user?.name ?? null };
}

/** ApiError를 JSON 응답으로 바꾼다. 예상 못 한 오류는 500으로 감싼다. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error("[api] 처리되지 않은 오류:", err);
  return NextResponse.json(
    { error: "INTERNAL", message: "서버 오류가 발생했습니다." },
    { status: 500 }
  );
}

/** 라우트 핸들러를 감싸 인증과 오류 응답을 일괄 처리한다. */
export function withCaller<T>(
  handler: (caller: Caller, req: Request, ctx: T) => Promise<NextResponse>
) {
  return async (req: Request, ctx: T): Promise<NextResponse> => {
    try {
      const caller = await getCaller(req);
      return await handler(caller, req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
