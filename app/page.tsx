"use client";

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
import Wordmark from "@/components/wordmark";
import SharePromise from "@/components/share-promise";
import {
  displayLocation,
  formatWhen,
  getCountdown,
  getPromiseDate,
  sortByWhen,
} from "@/lib/promise-time";
import { getParticipantNames } from "@/lib/promise-permissions";
import { getSamplePromise } from "@/lib/sample-promise";

import { Button } from "../components/ui/button";
import {
  CalendarDays,
  MapPin,
  PlusCircle,
  Share2,
  TriangleAlert,
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

  // 약속이 하나도 없을 때 보여줄 예시. 저장되지 않고 화면에서만 만든다.
  const samplePromise = useMemo(() => getSamplePromise(), []);

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
      <div className="min-h-screen bg-[var(--tk-ground)]">
        <div className="container mx-auto max-w-lg px-4 py-10">
          <div className="rounded-2xl bg-[var(--tk-paper)] p-6 text-center text-[var(--tk-faint)] shadow-sm ring-1 ring-black/5">
            로딩 중…
          </div>
        </div>
      </div>
    );
  }

  // 인증 안 된 경우 (useEffect가 /login 보내지만, 순간 깜빡임 방지)
  if (!session) return null;

  return (
    <div className="min-h-screen bg-[var(--tk-ground)]">
      {/* 다른 화면과 같은 폭을 쓴다. 넓게 늘리면 카드가 휑해지고
          글자가 상대적으로 작아 보인다. */}
      <div className="container mx-auto max-w-lg px-4 py-5">
        {/* 헤더: 좁은 화면에서는 제목과 조작부를 위아래로 나눈다.
            (예전에는 한 줄로 붙어 있어 이름이 세로로 쭈그러들었다) */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1>
              <Wordmark size="md" className="sm:hidden" />
              <Wordmark size="lg" className="max-sm:hidden" />
            </h1>
            <p className="tk-meta mt-1.5 truncate text-[var(--tk-sub)]">
              {kakaoName ? `${kakaoName}님의 약속` : "친구들과 함께하는 약속 관리"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* 손가락으로 누르는 화면이라 높이를 44px 이상으로 잡는다 */}
            <Link href="/create">
              <Button className="h-11 bg-[var(--tk-gold)] px-4 text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90">
                <PlusCircle className="w-4 h-4 mr-1.5" />
                새 약속
              </Button>
            </Link>
            <Button variant="outline" onClick={handleLogout} className="h-11 px-3.5">
              로그아웃
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl bg-[var(--tk-paper)] py-10 text-center tk-meta text-[var(--tk-faint)] shadow-sm ring-1 ring-black/5">
            로딩 중…
          </div>
        ) : loadError ? (
          <div className="rounded-2xl bg-[var(--tk-paper)] px-6 py-14 text-center shadow-sm ring-1 ring-[var(--tk-warn)]/25">
            <div className="mb-2 text-3xl">⚠️</div>
            <h2 className="tk-title mb-1 text-[var(--tk-ink)]">약속을 불러오지 못했습니다</h2>
            <p className="tk-meta mb-4 text-[var(--tk-sub)]">{loadError}</p>
            <Button variant="outline" className="h-11" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
          </div>
        ) : promises.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-[var(--tk-paper)] px-6 py-10 text-center shadow-sm ring-1 ring-black/5">
              <div className="mb-2 text-3xl">🎟️</div>
              <h2 className="tk-title mb-1 text-[var(--tk-ink)]">아직 약속이 없습니다</h2>
              <p className="tk-meta mx-auto mb-5 max-w-[26ch] text-balance break-keep text-[var(--tk-sub)]">
                참여한 약속만 여기에 표시됩니다. 새로 만들거나 친구에게 받은 링크로 참여하세요.
              </p>
              <Link href="/create">
                <Button className="h-11 bg-[var(--tk-gold)] px-4 text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90">
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  새 약속 만들기
                </Button>
              </Link>
            </div>

            {/* 약속이 어떻게 보이는지 알려주는 예시 한 장.
                저장된 약속이 아니라 화면에서만 만든 것이라 누를 수 없다. */}
            <p className="mt-3 px-1 tk-label text-[var(--tk-faint)]">
              약속을 만들면 이렇게 보입니다
            </p>
            <PromiseTicket promise={samplePromise} onOpen={() => {}} example />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.length > 0 && (
              <p className="px-1 tk-label text-[var(--tk-faint)]">
                다가오는 약속
              </p>
            )}
            {upcoming.map((p) => (
              <PromiseTicket key={p.id} promise={p} onOpen={openDetail} />
            ))}

            {past.length > 0 && (
              <p className="mt-4 px-1 tk-label text-[var(--tk-faint)]">
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
            <div className="flex items-center justify-center py-12 tk-meta text-[var(--tk-faint)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중…
            </div>
          ) : !detail ? (
            <div className="py-8 text-center tk-meta text-[var(--tk-faint)]">
              약속을 찾을 수 없습니다.
            </div>
          ) : (
            <>
              {/* 티켓 상단부: 제목 + 남은 시간 스텁 */}
              <DialogHeader className="space-y-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-[21px] font-extrabold leading-tight tracking-tight break-keep text-[var(--tk-ink)]">
                      {detail.title}
                    </DialogTitle>
                    <p className="mt-1 text-[12.5px] text-[var(--tk-faint)]">
                      만든 사람 · {displayCreator(detail)}
                    </p>
                  </div>
                  {(() => {
                    const c = getCountdown(getPromiseDate(detail));
                    const tone =
                      c.tone === "now"
                        ? "bg-[var(--tk-now-bg)] text-[var(--tk-now-ink)]"
                        : c.tone === "soon"
                          ? "bg-[var(--tk-hot-bg)] text-[var(--tk-hot-ink)]"
                          : "bg-[var(--tk-ground)] text-[var(--tk-faint)]";
                    return (
                      <div
                        className={`shrink-0 rounded-lg px-3 py-2 text-center leading-none ${tone}`}
                      >
                        <div className="text-[18px] font-extrabold tracking-tight tabular-nums">
                          {c.badge}
                        </div>
                        <div className="mt-1 text-[10px] font-bold opacity-80">{c.detail}</div>
                      </div>
                    );
                  })()}
                </div>
              </DialogHeader>

              {/* 절취선 */}
              <div className="border-t-2 border-dashed border-[var(--tk-line)]" />

              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-[14.5px] text-[var(--tk-sub)]">
                  <CalendarDays className="size-4 shrink-0 opacity-70" />
                  <span>{formatWhen(getPromiseDate(detail))}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[14.5px] text-[var(--tk-sub)]">
                  <MapPin className="size-4 shrink-0 opacity-70" />
                  <span>{displayLocation(detail.location)}</span>
                </div>
                {detail.penalty?.trim() ? (
                  <div className="flex items-center gap-2.5 text-[13px] text-[var(--tk-warn)]">
                    <TriangleAlert className="size-4 shrink-0" />
                    <span>지각 시 · {detail.penalty}</span>
                  </div>
                ) : null}

                {getParticipantNames(detail).length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex">
                      {getParticipantNames(detail)
                        .slice(0, 5)
                        .map((n, i) => (
                          <span
                            key={`${n}-${i}`}
                            title={n}
                            className="-mr-1.5 grid size-6 place-items-center rounded-full border-[1.5px] border-[var(--tk-paper)] bg-[var(--tk-ground)] text-[11px] font-bold text-[var(--tk-ink)]"
                          >
                            {n.trim().charAt(0) || "?"}
                          </span>
                        ))}
                    </div>
                    <span className="ml-2.5 text-[12px] text-[var(--tk-faint)]">
                      {getParticipantNames(detail).length}명 참여
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4 gap-2 sm:justify-between">
                <Button
                  asChild
                  className="bg-[var(--tk-gold)] text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90"
                >
                  <Link href={`/promise/${detail.id}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    자세히 보기
                  </Link>
                </Button>

                <div className="flex gap-2">
                  <SharePromise
                    promiseId={detail.id}
                    title={detail.title}
                    trigger={
                      <Button variant="outline">
                        <Share2 className="w-4 h-4 mr-1.5" />
                        공유
                      </Button>
                    }
                  />

                  {canDelete && (
                    <Button
                      variant="outline"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="border-[var(--tk-warn)]/40 text-[var(--tk-warn)] hover:bg-[var(--tk-warn)]/8 hover:text-[var(--tk-warn)]"
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      삭제
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
