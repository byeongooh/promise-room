"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";

export default function LoginButton() {
  const { data: session, status } = useSession();
  const [pending, setPending] = useState(false);

  if (status === "loading") return null;

  if (!session) {
    return (
      <button
        onClick={async () => {
          setPending(true);
          try {
            await signIn("kakao", { callbackUrl: "/" });
          } finally {
            setPending(false);
          }
        }}
        disabled={pending}
        style={{
          padding: 12,
          border: "1px solid #ccc",
          borderRadius: 8,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
          background: "white",
        }}
      >
        {pending ? "로그인 중..." : "카카오로 로그인"}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div>{session.user?.name ?? "사용자"}님</div>
      <button
        onClick={async () => {
          setPending(true);
          try {
            await signOut({ callbackUrl: "/login" });
          } finally {
            setPending(false);
          }
        }}
        disabled={pending}
        style={{
          padding: 12,
          border: "1px solid #ccc",
          borderRadius: 8,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
          background: "white",
        }}
      >
        {pending ? "로그아웃..." : "로그아웃"}
      </button>
    </div>
  );
}
