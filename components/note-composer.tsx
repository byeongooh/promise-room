"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

// 메모 한 줄을 담는 자리. 약속 안(챙길 것)과 그날 메모 둘 다 이걸 쓴다.
//
// **칩이 이 조각의 핵심이다.** 적는 게 원래 귀찮은 일이라, 자주 쓰는 것은
// 타이핑 없이 한 번 눌러 담게 한다. 칩 목록은 박아둔 게 아니라 본인이 지금까지
// 쓴 것에서 뽑는다(lib/calendar.ts의 frequentTexts) — 쓸수록 자기 목록이 된다.
//
// 칩을 늘 펼쳐두지는 않는다. 한 화면에 이 조각이 둘 이상 놓일 수 있어서
// (약속마다 하나 + 그날 하나) 칩 줄이 여러 개면 화면이 시끄러워진다.
// **아직 아무것도 안 담았을 때**와 **입력칸을 눌렀을 때**만 편다 — 그 두 순간이
// 도움이 실제로 필요한 때다.

export default function NoteComposer({
  chips,
  placeholder,
  empty,
  onAdd,
}: {
  chips: string[];
  placeholder: string;
  /** 이 자리에 아직 아무것도 없는지. 그때는 칩을 펼쳐 시작을 돕는다. */
  empty: boolean;
  onAdd: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showChips = chips.length > 0 && (empty || focused);

  const add = async (body: string, key: string) => {
    const v = body.trim();
    if (!v || busy) return;
    setBusy(key);
    setError(null);
    try {
      await onAdd(v);
      if (key === "input") setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {showChips && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              // 입력칸이 blur되기 전에 눌리도록. 안 그러면 칩이 사라지면서 클릭이 샌다.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(c, c)}
              disabled={busy !== null}
              className="tk-caption flex h-8 items-center gap-1 rounded-full bg-[var(--tk-disable)]
                px-3 text-[var(--tk-sub)] transition hover:brightness-95 disabled:opacity-60"
            >
              {busy === c ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3 opacity-50" />
              )}
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <p className="tk-caption mb-1.5 text-[var(--tk-warn)]">{error}</p>}

      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(text, "input");
          }}
          maxLength={200}
          placeholder={placeholder}
          aria-label={placeholder}
          className="tk-meta h-9 min-w-0 flex-1 rounded-lg bg-[var(--tk-ground)] px-3
            text-[var(--tk-ink)] outline-none placeholder:text-[var(--tk-assistive)]"
        />
        {text.trim() && (
          <button
            type="button"
            onClick={() => add(text, "input")}
            disabled={busy !== null}
            className="tk-caption h-9 shrink-0 rounded-lg bg-[var(--tk-ink)] px-3 font-bold
              text-[var(--tk-paper)] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy === "input" ? <Loader2 className="size-3.5 animate-spin" /> : "저장"}
          </button>
        )}
      </div>
    </div>
  );
}
