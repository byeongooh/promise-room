// /app/login/page.tsx
"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ display: "grid", gap: 12, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Promise Room</h1>
        <p style={{ color: "#666" }}>계속하려면 카카오로 로그인하세요</p>

        <button
          onClick={() => signIn("kakao", { callbackUrl: "/" })}
          style={{
            padding: 12,
            border: "1px solid #ccc",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          카카오로 로그인
        </button>
      </div>
    </div>
  );
}
