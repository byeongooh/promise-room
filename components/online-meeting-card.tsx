"use client";

import { useState } from "react";
import { Check, ExternalLink, Link2, Loader2, Video } from "lucide-react";

import { changePlace as apiChangePlace } from "@/lib/api-client";
import { meetingServiceName, safeMeetingUrl } from "@/lib/meeting-mode";
import type { PromiseData } from "@/lib/types";

// 온라인 플랜의 "어디서" — 지도 대신 들어갈 링크.
//
// 링크는 참여자가 입력한 값이고 화면에서 누를 수 있게 그린다. javascript: 나
// data: 같은 것을 그대로 href에 넣으면 누른 사람의 브라우저에서 코드가 돈다.
// safeMeetingUrl이 http(s)만 통과시키고, 여기서는 그 결과만 링크로 만든다.
//
// 새 창으로 열 때 rel="noopener noreferrer"를 반드시 붙인다. 없으면 열린
// 페이지가 window.opener로 이 탭을 다른 주소로 바꿔치기할 수 있다.

export default function OnlineMeetingCard({
  promise,
  isOwner,
  onChanged,
}: {
  promise: PromiseData;
  isOwner: boolean;
  onChanged?: () => void;
}) {
  const saved = safeMeetingUrl(promise.meetingUrl);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(promise.meetingUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    const next = safeMeetingUrl(draft);
    if (draft.trim() && !next) {
      setError("링크는 http:// 또는 https:// 로 시작해야 해요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 장소 변경과 같은 경로를 쓴다. 온라인 플랜은 좌표가 없으므로
      // 서비스 이름을 location에 넣고 링크를 따로 싣는다.
      await apiChangePlace(promise.id ?? "", {
        name: next ? meetingServiceName(next) : "",
        address: "",
        lat: 0,
        lng: 0,
        meetingUrl: next,
      });
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "링크를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("복사하지 못했어요. 링크를 길게 눌러 복사해주세요.");
    }
  };

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <p className="mb-2.5 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
        <Video className="size-3.5" />
        온라인으로 만나요
      </p>

      {error && <p className="tk-caption mb-2 text-[var(--tk-warn)]">{error}</p>}

      {editing ? (
        <>
          <input
            type="url"
            inputMode="url"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="https://zoom.us/j/…"
            className="h-11 w-full rounded-xl bg-[var(--tk-ground)] px-3.5 text-[14px]
              text-[var(--tk-ink)] outline-none placeholder:text-[var(--tk-faint)]"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px]
                bg-[var(--tk-ink)] text-[13px] font-bold text-[var(--tk-paper)]
                transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(promise.meetingUrl ?? "");
                setError(null);
              }}
              disabled={busy}
              className="h-11 rounded-[10px] px-4 text-[13px] font-bold text-[var(--tk-faint)]
                transition hover:text-[var(--tk-sub)] disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </>
      ) : saved ? (
        <>
          <div className="rounded-xl bg-[var(--tk-ground)] px-3.5 py-3">
            <p className="tk-meta font-bold">{meetingServiceName(saved)}</p>
            <p className="tk-caption mt-0.5 truncate text-[var(--tk-faint)]">{saved}</p>
          </div>

          <div className="mt-2 flex gap-1.5">
            <a
              href={saved}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px]
                bg-[var(--tk-ink)] text-[14px] font-bold text-[var(--tk-paper)]
                transition hover:brightness-110"
            >
              <ExternalLink className="size-4" />
              들어가기
            </a>
            <button
              type="button"
              onClick={copy}
              aria-label="링크 복사"
              className="grid size-12 shrink-0 place-items-center rounded-[10px]
                bg-[var(--tk-ground)] text-[var(--tk-sub)] transition hover:brightness-95"
            >
              {copied ? <Check className="size-4 text-[var(--ap-leaf)]" /> : <Link2 className="size-4" />}
            </button>
          </div>
        </>
      ) : (
        <p className="tk-meta rounded-xl bg-[var(--tk-ground)] px-3.5 py-3 text-[var(--tk-sub)]">
          {isOwner
            ? "아직 링크가 없어요. 아래에서 넣어주세요."
            : "아직 링크가 없어요. 플랜 만든 사람이 넣으면 여기에 보여요."}
        </p>
      )}

      {isOwner && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 h-11 w-full rounded-[10px] bg-[var(--tk-ground)] text-[13px]
            font-bold text-[var(--tk-ink)] transition hover:brightness-95"
        >
          {saved ? "링크 바꾸기" : "링크 넣기"}
        </button>
      )}
    </section>
  );
}
