"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 약속 정보 입력 폼. 장소는 지도에서 따로 고르므로 여기엔 없다.

interface Props {
  onCreate: (data: {
    title: string;
    date: string;
    time: string;
    password: string;
  }) => void;
  isSubmitting?: boolean;
}

const field =
  "h-11 rounded-xl border-[var(--tk-line)] bg-[var(--tk-paper)] text-[var(--tk-ink)] " +
  "placeholder:text-[var(--tk-faint)] focus-visible:border-[var(--tk-gold)] " +
  "focus-visible:ring-2 focus-visible:ring-[var(--tk-gold)]/25";

/**
 * 날짜·시간 입력은 값이 없을 때 브라우저가 "연도-월-일", "--:--" 같은
 * 회색 글씨를 넣는다. 지저분해서 비어 있는 동안은 글자를 감춰 빈 칸으로 두고,
 * 누르면 다시 보이게 한다. (달력·시계 아이콘은 그대로 남는다)
 */
function hideEmptyText(value: string, isFocused: boolean): React.CSSProperties {
  return value === "" && !isFocused ? { color: "transparent" } : {};
}

export default function FallbackCreatePromiseForm({ onCreate, isSubmitting = false }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<"date" | "time" | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ title, date, time, password });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="title" className="tk-field-label text-[var(--tk-sub)]">
          플랜 이름
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={field}
        />
      </div>

      {/* 날짜·시간을 나란히 두면(그리드 2칸) 좁은 폰 화면에서 인풋 하나가
          150px도 안 남는다. 네이티브 날짜·시간 위젯(달력·시계 아이콘 + 글자)은
          그보다 넓은 공간을 요구해서, 브라우저가 그 안에 욱여넣다가 아이콘과
          글자가 겹쳐 보인다. 세로로 쌓아 각자 전체 폭을 쓰게 한다. */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="date" className="tk-field-label text-[var(--tk-sub)]">
            날짜
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onFocus={() => setFocused("date")}
            onBlur={() => setFocused(null)}
            required
            className={field}
            // 비어 있을 때 뜨는 "연도-월-일" 회색 글씨를 감춘다.
            // 누르면(포커스) 다시 보여야 입력하는 게 보인다.
            style={hideEmptyText(date, focused === "date")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="time" className="tk-field-label text-[var(--tk-sub)]">
            시간
          </Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onFocus={() => setFocused("time")}
            onBlur={() => setFocused(null)}
            required
            className={field}
            style={hideEmptyText(time, focused === "time")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="tk-field-label text-[var(--tk-sub)]">
          비밀번호
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          className={field}
        />
        <p className="tk-caption text-[var(--tk-faint)]">
          4자 이상. 친구들이 이 비밀번호로 참여합니다.
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-xl bg-[var(--tk-gold)] text-[14.5px] font-bold text-[var(--tk-paper)] hover:bg-[var(--tk-gold)]/90"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            만드는 중…
          </>
        ) : (
          "플랜 만들기"
        )}
      </Button>
    </form>
  );
}
