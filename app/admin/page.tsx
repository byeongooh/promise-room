"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCountdown, getPromiseDate } from "@/lib/promise-time";

// 테스트 관찰용 관리자 화면. 카카오 로그인과 무관하게 동작한다.
// 읽기 전용 — 여기서 약속을 고치거나 지울 수는 없다.

type AdminPromise = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  penalty: string;
  creatorName: string;
  participantNames: string[];
  participantCount: number;
  createdAt: string | null;
};

type AdminData = {
  total: number;
  creators: { name: string; count: number }[];
  promises: AdminPromise[];
};

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/admin/promises");
    if (res.ok) {
      setData(await res.json());
      return true;
    }
    setData(null);
    return false;
  };

  // 이미 로그인돼 있으면 바로 보여준다
  useEffect(() => {
    load().finally(() => setChecking(false));
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "로그인에 실패했습니다.");
        return;
      }
      setPassword("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setData(null);
  };

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)]">
        <Loader2 className="size-5 animate-spin text-[var(--tk-faint)]" />
      </main>
    );
  }

  // ---------------- 로그인 화면 ----------------
  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)] px-5">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-2xl bg-[var(--tk-paper)] p-6 shadow-sm ring-1 ring-black/5"
        >
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="size-5 text-[var(--tk-gold)]" />
            <h1 className="tk-title text-[var(--tk-ink)]">관리자</h1>
          </div>
          <p className="tk-meta mb-4 text-[var(--tk-sub)]">
            테스트 관찰용 화면입니다. 모든 약속을 읽기 전용으로 봅니다.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="admin-pw" className="tk-field-label text-[var(--tk-sub)]">
              관리자 비밀번호
            </Label>
            <Input
              id="admin-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="h-11 rounded-xl border-[var(--tk-line)] focus-visible:border-[var(--tk-gold)] focus-visible:ring-2 focus-visible:ring-[var(--tk-gold)]/25"
            />
            {error && <p className="tk-caption text-[var(--tk-warn)]">{error}</p>}
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="mt-4 h-11 w-full rounded-xl bg-[var(--tk-gold)] font-bold text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "들어가기"}
          </Button>
        </form>
      </main>
    );
  }

  // ---------------- 관리자 목록 ----------------
  return (
    <main className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="tk-display text-[var(--tk-ink)]">관리자</h1>
            <p className="tk-meta text-[var(--tk-sub)]">
              전체 약속 {data.total}건 · 사용자 {data.creators.length}명
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => load()}>
              <RefreshCw className="size-4 mr-1.5" />
              새로고침
            </Button>
            <Button variant="outline" className="h-11" onClick={logout}>
              <LogOut className="size-4 mr-1.5" />
              나가기
            </Button>
          </div>
        </header>

        {/* 사용자별 집계 */}
        <section className="mb-4 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="tk-label mb-3 flex items-center gap-1.5 text-[var(--tk-faint)]">
            <Users className="size-3.5" /> 만든 사람
          </p>
          <div className="flex flex-wrap gap-2">
            {data.creators.map((c) => (
              <span
                key={c.name}
                className="tk-caption rounded-full bg-[var(--tk-ground)] px-3 py-1.5 text-[var(--tk-ink)]"
              >
                {c.name} <b className="tabular-nums">{c.count}</b>
              </span>
            ))}
          </div>
        </section>

        {/* 전체 약속 */}
        <div className="flex flex-col gap-2.5">
          {data.promises.map((p) => {
            const c = getCountdown(getPromiseDate({ date: p.date, time: p.time }));
            const tone =
              c.tone === "now"
                ? "bg-[var(--tk-now-bg)] text-[var(--tk-now-ink)]"
                : c.tone === "soon"
                  ? "bg-[var(--tk-hot-bg)] text-[var(--tk-hot-ink)]"
                  : "bg-[var(--tk-ground)] text-[var(--tk-faint)]";
            return (
              <div
                key={p.id}
                className="rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="tk-title truncate text-[var(--tk-ink)]">{p.title}</p>
                    <p className="tk-meta mt-1 text-[var(--tk-sub)]">
                      {p.date} {p.time} · {p.location || "장소 없음"}
                    </p>
                    <p className="tk-caption mt-1 text-[var(--tk-faint)]">
                      만든이 <b className="text-[var(--tk-sub)]">{p.creatorName}</b> · 참여{" "}
                      {p.participantCount}명
                      {p.participantNames.length > 0 && ` (${p.participantNames.join(", ")})`}
                    </p>
                    {p.penalty && (
                      <p className="tk-caption mt-1 text-[var(--tk-warn)]">벌칙 · {p.penalty}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center leading-none ${tone}`}
                  >
                    <span className="block text-[15px] font-extrabold tabular-nums">{c.badge}</span>
                  </span>
                </div>
                <p className="tk-caption mt-2 truncate font-mono text-[var(--tk-faint)]">{p.id}</p>
              </div>
            );
          })}
        </div>

        <p className="tk-caption mt-6 text-center text-[var(--tk-faint)]">
          읽기 전용입니다. 여기서는 약속을 고치거나 지울 수 없습니다.
        </p>
      </div>
    </main>
  );
}
