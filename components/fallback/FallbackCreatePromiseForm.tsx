"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Props 타입 정의 (✅ location 제거)
interface FallbackCreatePromiseFormProps {
  onCreate: (data: {
    title: string;
    date: string;
    time: string;
    penalty: string;
    password: string;
  }) => void;
  currentUser: string | null;
}

export default function FallbackCreatePromiseForm({
  onCreate,
  currentUser,
}: FallbackCreatePromiseFormProps) {
  // 폼 입력 상태 관리
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [penalty, setPenalty] = useState("");
  const [password, setPassword] = useState("");

  // 폼 제출 핸들러
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ✅ location 없이 전달
    onCreate({ title, date, time, penalty, password });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>약속 정보 입력</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">약속명</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">날짜</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="time">시간</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* ✅ 장소 입력칸 삭제됨 (지도에서만 선택) */}

          <div>
            <Label htmlFor="penalty">지각 벌칙</Label>
            <Input
              id="penalty"
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full">
            약속 만들기
          </Button>
        </form>

        <p className="mt-2 text-xs text-muted-foreground">
          현재 로그인: {currentUser || "없음"}
        </p>
      </CardContent>
    </Card>
  );
}
