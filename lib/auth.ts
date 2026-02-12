// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!, // 카카오 “클라이언트 시크릿” 사용 ON이면 필수
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async session({ session, token }) {
      // ✅ 앞으로 DB 사용자 키는 이것만 사용
      (session.user as any).id = token.sub; // 카카오 고유 사용자 id(대부분 sub로 들어옴)
      return session;
    },
  },
};
