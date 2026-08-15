// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";

import { toCanonicalUid } from "@/lib/uid";

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },

  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "kakao") {
        token.uid = toCanonicalUid(account.providerAccountId);
      }
      // 이 콜백이 생기기 전에 발급된 오래된 토큰은 uid가 없어서 token.sub(접두사
      // 없는 raw ID)로 흘러간다. 그대로 두면 권한 검사가 전부 어긋나 해당
      // 브라우저만 조용히 잠기므로, 여기서 표준 형식으로 back-fill 한다.
      if (!token.uid) {
        token.uid = toCanonicalUid(token.sub);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // 항상 "kakao:<id>" 표준형만 내보낸다.
        session.user.id = toCanonicalUid(token.uid ?? token.sub) ?? "";
      }
      return session;
    },
  },
};
