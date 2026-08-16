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
  matcher: ["/((?!api|admin|_next/static|_next/image|favicon.ico).*)"],
};
