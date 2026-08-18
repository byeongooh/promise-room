// middleware.ts (프로젝트 루트)
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // 카카오 로그인을 요구할 경로.
  // /admin 은 자체 비밀번호로 들어가는 테스트 관찰용 화면이라 제외한다.
  //
  // 정적 파일도 반드시 제외해야 한다. CSS의 @font-face가 보내는 폰트 요청은
  // 쿠키를 싣지 않는(익명) 요청이라, 로그인한 사용자여도 미들웨어가 로그인
  // 화면으로 돌려보낸다. 그러면 폰트 자리에 HTML이 오는데 font-display:swap
  // 때문에 에러 없이 시스템 폰트로 조용히 떨어져서 알아채기 어렵다.
  // (public/fonts/Pretendard를 붙이다가 실제로 겪었다.)
  matcher: [
    "/((?!api|admin|_next/static|_next/image|favicon.ico|.*\\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
