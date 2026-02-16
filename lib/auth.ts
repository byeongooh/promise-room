// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";

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
        (token as any).uid = `kakao:${account.providerAccountId}`;
        // uid를 표준화해서 앞으로 provider가 늘어나도 안전
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).uid ?? token.sub;
      }
      return session;
    },
  },
};
