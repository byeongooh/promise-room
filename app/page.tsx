"use client";

import { Badge } from "../components/ui/badge";
import { User as UserIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { db } from "../lib/firebase";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";

import { deletePromise } from "@/lib/api-client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import PromiseTicket from "@/components/promise-ticket";
import {
  displayLocation,
  formatWhen,
  getPromiseDate,
  sortByWhen,
} from "@/lib/promise-time";

import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  CalendarDays,
  Clock,
  MapPin,
  PlusCircle,
  ArrowLeft,
  Trash2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "../components/ui/dialog";

// ✅ NextAuth (카카오 로그인)
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

import type { PromiseData } from "../lib/types";
import { isPromiseOwner } from "../lib/promise-permissions";

type PromiseDoc = PromiseData & { id: string };

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // ✅ 카카오 로그인 이름만 사용 (여기서 123 같은 폴백 사용자 완전 제거)
  const kakaoName = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n && n.length > 0 ? n : null;
  }, [session?.user?.name]);

  const currentUserId = session?.user?.id;
  const { ready: firebaseReady } = useFirebaseAuth();

  const [promises, setPromises] = useState<PromiseDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromiseDoc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ✅ 로그인 안 되어있으면 /login으로 이동
  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [status, session, router]);

  // ✅ Firestore 구독 — 내가 참여한 약속만.
  // NextAuth 로그인만으로는 부족하고 Firebase 로그인까지 끝나야(ready) 조회할 수 있다.
  useEffect(() => {
    if (!firebaseReady || !currentUserId) {
      setPromises([]);
      setLoading(status === "loading" || status === "authenticated");
      return;
    }

    const q = query(
      collection(db, "promises"),
      where("participantIds", "array-contains", currentUserId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPromises(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PromiseData) })));
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        // 예전에는 여기서 전체 컬렉션을 다시 읽는 폴백이 있었는데,
        // 권한 오류를 조용히 삼켜 빈 목록처럼 보이게 만들었다. 이제 드러낸다.
        console.error("약속 목록 구독 실패:", err);
        setLoadError(
          err.code === "failed-precondition"
            ? "색인이 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
            : "약속 목록을 불러오지 못했습니다."
        );
        setLoading(false);
      }
    );

    return () => unsub();
  }, [firebaseReady, currentUserId, status]);

  // 다가오는 약속은 임박한 순, 지난 약속은 최근 순으로 나눠 보여준다.
  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const sorted = sortByWhen(promises, now);
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
  }, [promises]);

  const displayCreator = (p: PromiseDoc) => {
    const name = p.creatorName ?? p.creator;
    return name && name.trim() !== "" ? name : "알 수 없음";
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const ref = doc(db, "promises", id);
      const snap = await getDoc(ref);
      setDetail(snap.exists() ? { id: snap.id, ...(snap.data() as PromiseData) } : null);
    } catch (e) {
      console.error(e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDetailLoading(false);
  };

  const fmtDate = (date?: string | Timestamp) => {
    if (!date) return "날짜 정보 없음";
    try {
      if (date instanceof Timestamp) {
        return date.toDate().toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        });
      }
      const dt = new Date(date + "T00:00:00Z");
      return dt.toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
    } catch {
      return "날짜 변환 오류";
    }
  };

  // ✅ 삭제 권한: 만든 사람 (ID 우선, 이름 폴백)
  const canDelete = useMemo(() => {
    if (!detail) return false;
    return isPromiseOwner(detail, currentUserId, kakaoName ?? undefined);
  }, [detail, currentUserId, kakaoName]);

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!detail || !isPromiseOwner(detail, currentUserId, kakaoName ?? undefined)) {
      alert("이 약속은 만든 사람만 삭제할 수 있습니다.");
      return;
    }

    setDeleting(true);
    try {
      await deletePromise(selectedId);
      closeDetail();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "약속 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  // ✅ 로그아웃은 NextAuth만
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  // 로딩 중 화면
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-5xl">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              로딩 중…
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 인증 안 된 경우 (useEffect가 /login 보내지만, 순간 깜빡임 방지)
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-3xl sm:py-8">
        {/* 헤더: 좁은 화면에서는 제목과 조작부를 위아래로 나눈다.
            (예전에는 한 줄로 붙어 있어 이름이 세로로 쭈그러들었다) */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Promise Room</h1>
            <p className="truncate text-sm text-muted-foreground">
              {kakaoName ? `${kakaoName}님의 약속` : "친구들과 함께하는 약속 관리"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/create" className="flex-1 sm:flex-none">
              <Button className="w-full">
                <PlusCircle className="w-4 h-4 mr-2" />
                새 약속
              </Button>
            </Link>
            <Button variant="outline" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </header>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              로딩 중…
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card className="border-destructive/40">
            <CardContent className="py-16 text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <h2 className="text-xl font-semibold mb-1">약속을 불러오지 못했습니다</h2>
              <p className="text-muted-foreground mb-4">{loadError}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </CardContent>
          </Card>
        ) : promises.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="text-3xl mb-2">🗓️</div>
              <h2 className="text-xl font-semibold mb-1">아직 약속이 없습니다</h2>
              <p className="text-muted-foreground mb-4">
                참여한 약속만 여기에 표시됩니다. 새 약속을 만들거나 친구에게 받은 링크로 참여하세요.
              </p>
              <Link href="/create">
                <Button>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  새 약속 만들기
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.length > 0 && (
              <p className="px-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">
                다가오는 약속
              </p>
            )}
            {upcoming.map((p) => (
              <PromiseTicket key={p.id} promise={p} onOpen={openDetail} />
            ))}

            {past.length > 0 && (
              <p className="mt-4 px-1 text-[11px] font-bold tracking-[0.12em] text-muted-foreground">
                지난 약속
              </p>
            )}
            {past.map((p) => (
              <PromiseTicket key={p.id} promise={p} onOpen={openDetail} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => (!v ? closeDetail() : setOpen(v))}>
        <DialogContent className="max-w-2xl">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중…
            </div>
          ) : !detail ? (
            <div className="py-8 text-center text-muted-foreground">
              약속을 찾을 수 없습니다.
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{detail.title}</DialogTitle>

                <div className="mt-1 flex items-center gap-2">
                  <Badge className="rounded-full px-2 py-0.5 text-[11px]">
                    만든 사람
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold">
                    <UserIcon className="w-4 h-4" />
                    {displayCreator(detail)}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-lg">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  <span>{formatWhen(getPromiseDate(detail))}</span>
                </div>
                <div className="flex items-center gap-3 text-lg">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>{displayLocation(detail.location)}</span>
                </div>
                {detail.penalty && (
                  <div className="text-sm text-muted-foreground">
                    벌칙: {detail.penalty}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6 flex items-center justify-between">
                <Button variant="ghost" asChild>
                  <Link href={`/promise/${detail.id}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    페이지로 열기
                  </Link>
                </Button>

                <div className="flex gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      닫기
                    </Button>
                  </DialogClose>

                  {canDelete && (
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      약속 삭제
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
