"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 관리자 비밀번호를 정하는 1회용 설정 화면.
// 여기서 나온 값을 사람이 직접 환경변수에 넣어야 실제로 적용된다.
// 설정이 끝나면 이 화면은 스스로 닫힌다.

export default function AdminSetupPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/setup")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("두 번 입력한 비밀번호가 다릅니다.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "만들지 못했습니다.");
        return;
      }
      setLine(body.line);
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 직접 선택해 복사하도록 둔다 */
    }
  };

  if (configured === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)]">
        <Loader2 className="size-5 animate-spin text-[var(--tk-faint)]" />
      </main>
    );
  }

  if (configured) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)] px-5">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--tk-paper)] p-6 text-center shadow-sm ring-1 ring-black/5">
          <ShieldCheck className="mx-auto mb-3 size-8 text-[var(--tk-gold)]" />
          <h1 className="tk-title mb-1 text-[var(--tk-ink)]">이미 설정되어 있습니다</h1>
          <p className="tk-meta mb-4 text-[var(--tk-sub)]">
            보안을 위해 이 페이지는 더 이상 쓸 수 없습니다. 비밀번호를 바꾸려면 환경변수를 지운 뒤
            다시 오세요.
          </p>
          <Button asChild variant="outline" className="h-11">
            <a href="/admin">관리자 화면으로</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--tk-ground)] px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="size-5 text-[var(--tk-gold)]" />
          <h1 className="tk-display text-[var(--tk-ink)]">관리자 비밀번호 정하기</h1>
        </div>

        {!line ? (
          <form
            onSubmit={submit}
            className="rounded-2xl bg-[var(--tk-paper)] p-5 shadow-sm ring-1 ring-black/5"
          >
            <p className="tk-meta mb-4 text-[var(--tk-sub)]">
              여기서 정한 비밀번호로 <b>모든 플랜을 볼 수 있습니다.</b> 남들이 추측하기 어려운
              값으로 정해주세요.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw" className="tk-field-label text-[var(--tk-sub)]">
                  비밀번호 <span className="font-normal text-[var(--tk-faint)]">8자 이상</span>
                </Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                  className="h-11 rounded-xl border-[var(--tk-line)] focus-visible:border-[var(--tk-gold)] focus-visible:ring-2 focus-visible:ring-[var(--tk-gold)]/25"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pw2" className="tk-field-label text-[var(--tk-sub)]">
                  한 번 더
                </Label>
                <Input
                  id="pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="h-11 rounded-xl border-[var(--tk-line)] focus-visible:border-[var(--tk-gold)] focus-visible:ring-2 focus-visible:ring-[var(--tk-gold)]/25"
                />
              </div>

              {error && <p className="tk-caption text-[var(--tk-warn)]">{error}</p>}
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="mt-4 h-12 w-full rounded-xl bg-[var(--tk-gold)] font-bold text-[var(--tk-paper)] hover:bg-[var(--tk-gold)]/90"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "만들기"}
            </Button>

            <p className="tk-caption mt-3 text-[var(--tk-faint)]">
              비밀번호는 저장되지 않습니다. 아래에 나오는 값을 직접 등록해야 적용됩니다.
            </p>
          </form>
        ) : (
          <div className="rounded-2xl bg-[var(--tk-paper)] p-5 shadow-sm ring-1 ring-black/5">
            <p className="tk-meta mb-3 text-[var(--tk-sub)]">
              아래 값을 <b>두 곳</b>에 등록하면 적용됩니다.
            </p>

            <div className="mb-3 rounded-xl bg-[var(--tk-ground)] p-3">
              <code className="block break-all font-mono text-[11.5px] leading-relaxed text-[var(--tk-ink)]">
                {line}
              </code>
            </div>

            <Button
              onClick={copy}
              className="h-11 w-full rounded-xl bg-[var(--tk-gold)] font-bold text-[var(--tk-paper)] hover:bg-[var(--tk-gold)]/90"
            >
              {copied ? (
                <>
                  <Check className="size-4 mr-1.5" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5" />
                  복사하기
                </>
              )}
            </Button>

            <ol className="tk-meta mt-4 list-decimal space-y-2 pl-5 text-[var(--tk-sub)]">
              <li>
                프로젝트 폴더의 <code className="font-mono text-[12px]">.env.local</code> 파일 맨
                아래에 붙여넣기
              </li>
              <li>
                Vercel → Settings → Environment Variables 에 등록
                <br />
                <span className="tk-caption text-[var(--tk-faint)]">
                  이름 <code className="font-mono">ADMIN_PASSWORD_HASH</code> / 값은{" "}
                  <code className="font-mono">scrypt:</code> 부터
                </span>
              </li>
              <li>서버를 다시 시작하면 적용됩니다</li>
            </ol>

            <p className="tk-caption mt-4 text-[var(--tk-warn)]">
              이 값은 한 번만 보입니다. 창을 닫기 전에 복사해두세요.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
