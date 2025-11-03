'use client';

import { Badge } from '../components/ui/badge';
import { User as UserIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db, auth } from '../lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  CalendarDays,
  Clock,
  MapPin,
  PlusCircle,
  ArrowLeft,
  Trash2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '../components/ui/dialog';

import { useUser } from '@/lib/user-context';
import FallbackUserLogin from '@/components/fallback/FallbackUserLogin';

type PromiseDoc = {
  id: string;
  title: string;
  date?: string | Timestamp;
  time?: string;
  location?: string;
  creator?: string;
  penalty?: string;
  participants?: string[];
  password?: string;
  createdAt?: Timestamp;
};

export default function HomePage() {
  // 1) 모든 훅 선언은 항상 고정된 순서로
  const { currentUser, logout } = useUser();
// 만든 사람 표시용 (없으면 '알 수 없음')
const displayCreator = (src: { creator?: string } | null | undefined) =>
  (src?.creator && src.creator.trim() !== '') ? src.creator : '알 수 없음';

  const [promises, setPromises] = useState<PromiseDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromiseDoc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 2) Firestore 구독은 로그인 상태에서만 시작
  useEffect(() => {
    // 로그인 안됐으면 목록 초기화하고 끝
    if (!currentUser) {
      setPromises([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'promises');
    const q = query(colRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PromiseDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setPromises(rows);
        setLoading(false);
      },
      async () => {
        // 스냅샷 실패 시 1회 폴백
        const snap2 = await getDocs(colRef);
        const rows2: PromiseDoc[] = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setPromises(rows2);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const ref = doc(db, 'promises', id);
      const snap = await getDoc(ref);
      setDetail(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null);
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
    if (!date) return '날짜 정보 없음';
    try {
      if (date instanceof Timestamp) {
        return date.toDate().toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        });
      }
      const dt = new Date(date + 'T00:00:00Z');
      return dt.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
    } catch {
      return '날짜 변환 오류';
    }
  };

 const canDelete = useMemo(() => {
  if (!detail) return false;
  if (!currentUser) return false;
  return detail.creator === currentUser;
}, [detail, currentUser]);


 const handleDelete = async () => {
  if (!selectedId) return;

  if (!detail || !currentUser || detail.creator !== currentUser) {
    alert('이 약속은 만든 사람만 삭제할 수 있습니다.');
    return;
  }

  setDeleting(true);
  try {
    await deleteDoc(doc(db, 'promises', selectedId));
    closeDetail();
  } catch (e) {
    console.error(e);
    alert('약속 삭제 중 오류가 발생했습니다.');
  } finally {
    setDeleting(false);
  }
};

  // 3) 훅 선언이 모두 끝난 "뒤"에서 로그인 가드로 다른 JSX 리턴
  if (!currentUser) {
    return <FallbackUserLogin />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Promise Room</h1>
            <p className="text-muted-foreground">친구들과 함께하는 약속 관리</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/create">
              <Button>
                <PlusCircle className="w-4 h-4 mr-2" />
                새 약속 만들기
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await signOut(auth); // Firebase 세션 종료
                  logout();            // 우리 컨텍스트/세션Storage 종료
                  window.location.href = '/';
                } catch (e) {
                  console.error(e);
                  alert('로그아웃 중 오류가 발생했습니다.');
                }
              }}
            >
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
              <button key={p.id} onClick={() => openDetail(p.id)} className="text-left">
                <Card className="hover:shadow-md transition">
                  <CardHeader>
                    <CardTitle className="text-2xl">{p.title || '(제목 없음)'}</CardTitle>
                    <div className="mt-1 flex items-center gap-2">
  <Badge className="rounded-full px-2 py-0.5 text-[11px]">만든 사람</Badge>
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
                      <span>{p.time || '시간 미정'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>{p.location || '장소 미정'}</span>
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
            <div className="py-8 text-center text-muted-foreground">약속을 찾을 수 없습니다.</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{detail.title}</DialogTitle>
               <div className="mt-1 flex items-center gap-2">
  <Badge className="rounded-full px-2 py-0.5 text-[11px]">만든 사람</Badge>
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
                  <span>{detail.time || '시간 미정'}</span>
                </div>
                <div className="flex items-center gap-3 text-lg">
                  <MapPin className="w-5 h-5 text-primary" />
                  <span>{detail.location || '장소 미정'}</span>
                </div>
                {detail.penalty && (
                  <div className="text-sm text-muted-foreground">벌칙: {detail.penalty}</div>
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
                    <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
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