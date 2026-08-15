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
  Timestamp,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

import { deletePromise } from "@/lib/api-client";

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

  const [promises, setPromises] = useState<PromiseDoc[]>([]);
  const [loading, setLoading] = useState(true);

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

  // ✅ Firestore 구독 (로그인 완료 후에만)
  useEffect(() => {
    if (status !== "authenticated") {
      setPromises([]);
      setLoading(status === "loading");
      return;
    }

    const colRef = collection(db, "promises");
    const q = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PromiseDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as PromiseData),
        }));
        setPromises(rows);
        setLoading(false);
      },
      async () => {
        // fallback
        const snap2 = await getDocs(colRef);
        const rows2: PromiseDoc[] = snap2.docs.map((d) => ({
          id: d.id,
          ...(d.data() as PromiseData),
        }));
        setPromises(rows2);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [status]);

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
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Promise Room</h1>
            <p className="text-muted-foreground">친구들과 함께하는 약속 관리</p>
          </div>

          <div className="flex items-center gap-2">
            {/* ✅ 로그인 사용자 표시 */}
            <div className="text-sm font-semibold px-3 py-2 border rounded-md bg-white">
              {kakaoName ?? "사용자"}님
            </div>

            <Link href="/create">
              <Button>
                <PlusCircle className="w-4 h-4 mr-2" />
                새 약속 만들기
              </Button>
            </Link>

            {/* ✅ 로그아웃 버튼 1개만 */}
            <Button variant="outline" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              로딩 중…
            </CardContent>
          </Card>
        ) : promises.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="text-3xl mb-2">🗓️</div>
              <h2 className="text-xl font-semibold mb-1">아직 약속이 없습니다</h2>
              <p className="text-muted-foreground mb-4">
                새 약속 만들기 버튼을 눌러 첫 약속을 만들어보세요
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
          <div className="grid gap-6 md:grid-cols-2">
            {promises.map((p) => (
              <button
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="text-left"
              >
                <Card className="hover:shadow-md transition">
                  <CardHeader>
                    <CardTitle className="text-2xl">
                      {p.title || "(제목 없음)"}
                    </CardTitle>

                    <div className="mt-1 flex items-center gap-2">
                      <Badge className="rounded-full px-2 py-0.5 text-[11px]">
                        만든 사람
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold">
                        <UserIcon className="w-4 h-4" />
                        {displayCreator(p)}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <span>{fmtDate(p.date ?? p.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span>{p.time || "시간 미정"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>{p.location || "장소 미정"}</span>
                    </div>
                  </CardContent>
                </Card>
              </button>
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
                  <span>{fmtDate(detail.date ?? detail.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-lg">
                  <Clock className="w-5 h-5 text-primary" />
                  <span>{detail.time || "시간 미정"}</span>
                </div>
                <div className="flex items-center gap-3 text-lg">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>{detail.location || "장소 미정"}</span>
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
