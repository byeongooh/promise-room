import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { UserProvider } from "@/lib/user-context"
import Providers from "@/components/providers";

export const metadata: Metadata = {
  title: "Promise Room - 약속 관리",
  description: "친구들과 함께하는 약속 관리 앱",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script
          defer
          src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=5f766f91d8c8490e707f03ab1523a2b8&libraries=services&autoload=false"
        />
      </head>
      <body className="font-sans antialiased">
  <Providers>
    <UserProvider>{children}</UserProvider>
  </Providers>
</body>

    </html>
  )
}
