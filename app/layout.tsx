import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Archivo } from "next/font/google"
import "./globals.css"
import Providers from "@/components/providers";
import FirebaseAuthProvider from "@/components/firebase-auth-provider";

// 워드마크(Applan) 전용 라틴 서체. 본문은 Pretendard(globals.css).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Applan — 약속을 지킨 만큼 사과가 익어요",
  description: "친구와 플랜을 잡고, 지킨 만큼 내 사과가 익는 앱",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={archivo.variable}>
      <head>
        <script
          defer
          src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=5f766f91d8c8490e707f03ab1523a2b8&libraries=services&autoload=false"
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <FirebaseAuthProvider>{children}</FirebaseAuthProvider>
        </Providers>
      </body>
    </html>
  )
}
