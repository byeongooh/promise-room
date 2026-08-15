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
    penalty: string;
    password: string;
  }) => void;
  isSubmitting?: boolean;
}

const field =
  "h-11 rounded-xl border-[var(--tk-line)] bg-[var(--tk-paper)] text-[var(--tk-ink)] placeholder:text-[var(--tk-faint)]";
const labelCls = "text-[12.5px] font-bold text-[var(--tk-sub)]";

export default function FallbackCreatePromiseForm({ onCreate, isSubmitting = false }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [penalty, setPenalty] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ title, date, time, penalty, password });
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="title" className={labelCls}>
          약속명
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 아일릿 콘서트 보러가기"
          required
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date" className={labelCls}>
            날짜
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time" className={labelCls}>
            시간
          </Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className={field}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="penalty" className={labelCls}>
          지각 벌칙 <span className="font-normal text-[var(--tk-faint)]">(선택)</span>
        </Label>
        <Input
          id="penalty"
          value={penalty}
          onChange={(e) => setPenalty(e.target.value)}
          placeholder="예) 늦으면 커피 사기"
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className={labelCls}>
          비밀번호
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder="6자 이상"
          className={field}
        />
        <p className="text-[11.5px] text-[var(--tk-faint)]">
          친구들이 이 비밀번호로 약속에 참여합니다. 링크와 함께 알려주세요.
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-xl bg-[var(--tk-gold)] text-[14.5px] font-bold text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            만드는 중…
          </>
        ) : (
          "약속 만들기"
        )}
      </Button>
    </form>
  );
}
