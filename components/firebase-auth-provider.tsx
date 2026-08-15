"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { onIdTokenChanged, signInWithCustomToken, signOut } from "firebase/auth";

import { auth } from "@/lib/firebase";

// 카카오 로그인이 끝났다고 해서 Firebase 로그인까지 끝난 게 아니다.
// Firestore 호출이 그 사이 시간을 앞질러 나가면 권한 오류가 나므로,
// 화면들은 NextAuth의 status가 아니라 여기서 주는 ready를 보고 움직여야 한다.

interface FirebaseAuthState {
  /** Firebase 로그인이 끝나 Firestore를 호출해도 되는 상태인지. */
  ready: boolean;
  /** 현재 Firebase에 로그인된 uid. */
  uid: string | null;
  error: string | null;
}

const FirebaseAuthContext = createContext<FirebaseAuthState>({
  ready: false,
  uid: null,
  error: null,
});

export function useFirebaseAuth(): FirebaseAuthState {
  return useContext(FirebaseAuthContext);
}

export default function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const sessionUid = session?.user?.id ?? null;

  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // StrictMode에서 effect가 두 번 도는 동안 토큰 교환이 중복 실행되는 걸 막는다.
  const inFlight = useRef(false);

  useEffect(() => onIdTokenChanged(auth, (user) => setUid(user?.uid ?? null)), []);

  useEffect(() => {
    if (status === "loading") return;

    // 카카오 로그아웃 → Firebase도 같이 로그아웃
    if (status !== "authenticated" || !sessionUid) {
      if (auth.currentUser) void signOut(auth);
      return;
    }

    if (auth.currentUser?.uid === sessionUid) return;
    if (inFlight.current) return;

    inFlight.current = true;
    (async () => {
      try {
        setError(null);
        const res = await fetch("/api/firebase/token", { method: "POST" });
        if (!res.ok) throw new Error(`토큰 발급 실패 (${res.status})`);
        const { token } = (await res.json()) as { token: string };
        await signInWithCustomToken(auth, token);
      } catch (e) {
        console.error("[firebase-auth] 로그인 실패:", e);
        setError(e instanceof Error ? e.message : "Firebase 로그인에 실패했습니다.");
      } finally {
        inFlight.current = false;
      }
    })();
  }, [status, sessionUid]);

  const ready = status === "authenticated" && !!sessionUid && uid === sessionUid;

  return (
    <FirebaseAuthContext.Provider value={{ ready, uid, error }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}
