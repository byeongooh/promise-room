import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** 항상 "kakao:<카카오ID>" 표준 형식. lib/uid.ts 참고. */
    uid?: string;
  }
}
