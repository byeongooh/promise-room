"use client";

import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// 참여자만 약속을 볼 수 있으므로, 친구를 부르는 방법은 링크를 보내는 것뿐이다.
// 비밀번호도 같이 알려줘야 참여할 수 있어서 한 메시지로 묶어 보낼 수 있게 한다.

export default function SharePromise({
  promiseId,
  title,
  trigger,
}: {
  promiseId: string;
  title: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/promise/${promiseId}`
      : `/promise/${promiseId}`;

  const message = password.trim()
    ? `"${title}" 플랜에 초대합니다.\n${url}\n비밀번호: ${password.trim()}`
    : `"${title}" 플랜에 초대합니다.\n${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 못 쓰는 브라우저에서는 직접 선택해 복사하도록 둔다
    }
  };

  // 폰에서는 기기 공유 시트가 떠서 카카오톡으로 바로 보낼 수 있다
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: message });
    } catch {
      // 사용자가 취소한 경우 — 아무것도 하지 않는다
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            className="h-11 border-[var(--tk-line)] text-[var(--tk-sub)]"
          >
            <Share2 className="size-4 mr-1.5" />
            공유
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="tk-title text-[var(--tk-ink)]">플랜 공유하기</DialogTitle>
          <DialogDescription className="tk-meta text-[var(--tk-sub)]">
            링크를 받은 친구가 비밀번호를 넣으면 참여됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-[var(--tk-ground)] px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-[var(--tk-faint)]" />
            <span className="tk-caption min-w-0 flex-1 truncate text-[var(--tk-sub)]">{url}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-pw" className="tk-field-label text-[var(--tk-sub)]">
              비밀번호 함께 보내기{" "}
              <span className="font-normal text-[var(--tk-faint)]">선택</span>
            </Label>
            <Input
              id="share-pw"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="플랜 비밀번호"
              className="h-11 rounded-xl border-[var(--tk-line)] bg-[var(--tk-paper)]
                focus-visible:border-[var(--tk-gold)] focus-visible:ring-2
                focus-visible:ring-[var(--tk-gold)]/25"
            />
            <p className="tk-caption text-[var(--tk-faint)]">
              적어두면 링크와 함께 한 번에 보냅니다. 저장되지는 않습니다.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={copy}
              variant="outline"
              className="h-11 flex-1 border-[var(--tk-line)]"
            >
              {copied ? (
                <>
                  <Check className="size-4 mr-1.5 text-[var(--tk-hot-ink)]" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5" />
                  복사
                </>
              )}
            </Button>

            {canNativeShare && (
              <Button
                onClick={nativeShare}
                className="h-11 flex-1 bg-[var(--tk-gold)] font-bold text-[var(--tk-paper)]
                  hover:bg-[var(--tk-gold)]/90"
              >
                <Share2 className="size-4 mr-1.5" />
                보내기
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
