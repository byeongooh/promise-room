"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, KeyRound, Loader2, LogOut, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PromiseTicket from "@/components/promise-ticket";
import { getCountdown, getPromiseDate, sortByWhen } from "@/lib/promise-time";
import type { PromiseData } from "@/lib/types";

// 테스트 관찰용 관리자 화면. 카카오 로그인과 무관하게 동작한다.
// 읽기 전용 — 여기서 약속을 고치거나 지울 수는 없다.

type AdminPromise = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  penalty: string;
  creatorId: string | null;
  creatorName: string;
  participantIds: string[];
  participantNames: string[];
};

type AdminUser = { uid: string; name: string; created: number; joined: number };

type AdminData = {
  total: number;
  users: AdminUser[];
  promises: AdminPromise[];
};

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewAs, setViewAs] = useState<string | null>(null); // uid

  const load = async () => {
    const res = await fetch("/api/admin/promises");
    if (res.ok) {
      setData(await res.json());
      return true;
    }
    setData(null);
    return false;
  };

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
    setViewAs(null);
  };

  // 고른 사람에게 실제로 보이는 약속만 추린다.
  // 앱의 대시보드와 같은 조건(participantIds에 내 uid가 있는가)을 쓴다.
  const asUser = data?.users.find((u) => u.uid === viewAs) ?? null;

  const visible = useMemo<{ upcoming: AdminPromise[]; past: AdminPromise[] }>(() => {
    if (!data || !viewAs) return { upcoming: [], past: [] };
    const mine = data.promises.filter((p) => p.participantIds.includes(viewAs));
    const now = new Date();
    const sorted = sortByWhen(mine, now);
    return {
      upcoming: sorted.filter((p) => {
        const d = getPromiseDate(p);
        return !d || d.getTime() >= now.getTime();
      }),
      past: sorted.filter((p) => {
        const d = getPromiseDate(p);
        return !!d && d.getTime() < now.getTime();
      }),
    };
  }, [data, viewAs]);

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)]">
        <Loader2 className="size-5 animate-spin text-[var(--tk-faint)]" />
      </main>
    );
  }

  // ---------------- 로그인 ----------------
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

  // ---------------- 관리자 ----------------
  return (
    <main className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="tk-display text-[var(--tk-ink)]">관리자</h1>
            <p className="tk-meta text-[var(--tk-sub)]">
              약속 {data.total}건 · 사용자 {data.users.length}명
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="h-11" onClick={() => load()}>
              <RefreshCw className="size-4" />
            </Button>
            <Button variant="outline" className="h-11" onClick={logout}>
              <LogOut className="size-4 mr-1.5" />
              나가기
            </Button>
          </div>
        </header>

        {/* 사용자 고르기 */}
        <section className="mb-4 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="tk-label mb-3 flex items-center gap-1.5 text-[var(--tk-faint)]">
            <Users className="size-3.5" /> 사람을 누르면 그 사람 화면이 보입니다
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewAs(null)}
              className={`tk-caption rounded-full px-3 py-2 transition ${
                viewAs === null
                  ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                  : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
              }`}
            >
              전체 약속
            </button>
            {data.users.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => setViewAs(u.uid)}
                title={u.uid}
                className={`tk-caption rounded-full px-3 py-2 transition ${
                  viewAs === u.uid
                    ? "bg-[var(--tk-ink)] font-bold text-[var(--tk-paper)]"
                    : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
                }`}
              >
                {u.name} <b className="tabular-nums">{u.joined}</b>
              </button>
            ))}
          </div>
        </section>

        {viewAs && asUser ? (
          /* ---------- 특정 사용자에게 보이는 화면 ---------- */
          <section>
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--tk-hot-bg)] px-3.5 py-2.5">
              <Eye className="size-4 shrink-0 text-[var(--tk-hot-ink)]" />
              <p className="tk-caption min-w-0 text-[var(--tk-hot-ink)]">
                <b>{asUser.name}</b> 님에게 보이는 화면 · 약속 {visible.upcoming.length +
                  visible.past.length}
                건
                <span className="ml-1.5 font-mono opacity-70">{asUser.uid}</span>
              </p>
            </div>

            {visible.upcoming.length === 0 && visible.past.length === 0 ? (
              <div className="rounded-2xl bg-[var(--tk-paper)] px-6 py-14 text-center shadow-sm ring-1 ring-black/5">
                <div className="mb-2 text-3xl">🎟️</div>
                <p className="tk-title text-[var(--tk-ink)]">보이는 약속이 없습니다</p>
                <p className="tk-meta mt-1 text-[var(--tk-sub)]">
                  이 사람은 아직 어떤 약속에도 참여하지 않았습니다.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visible.upcoming.length > 0 && (
                  <p className="px-1 tk-label text-[var(--tk-faint)]">다가오는 약속</p>
                )}
                {visible.upcoming.map((p: AdminPromise) => (
                  <PromiseTicket
                    key={p.id}
                    promise={p as unknown as PromiseData & { id: string }}
                    onOpen={() => {}}
                  />
                ))}

                {visible.past.length > 0 && (
                  <p className="mt-3 px-1 tk-label text-[var(--tk-faint)]">지난 약속</p>
                )}
                {visible.past.map((p: AdminPromise) => (
                  <PromiseTicket
                    key={p.id}
                    promise={p as unknown as PromiseData & { id: string }}
                    onOpen={() => {}}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ---------- 전체 약속 ---------- */
          <div className="flex flex-col gap-2.5">
            {data.promises.map((p) => {
              const c = getCountdown(getPromiseDate(p));
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
                        {p.participantIds.length}명
                        {p.participantNames.length > 0 && ` (${p.participantNames.join(", ")})`}
                      </p>
                      {p.penalty && (
                        <p className="tk-caption mt-1 text-[var(--tk-warn)]">벌칙 · {p.penalty}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center leading-none ${tone}`}
                    >
                      <span className="block text-[15px] font-extrabold tabular-nums">
                        {c.badge}
                      </span>
                    </span>
                  </div>
                  <p className="tk-caption mt-2 truncate font-mono text-[var(--tk-faint)]">
                    {p.id}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className="tk-caption mt-6 text-center text-[var(--tk-faint)]">
          읽기 전용입니다. 여기서는 약속을 고치거나 지울 수 없습니다.
        </p>
      </div>
    </main>
  );
}
