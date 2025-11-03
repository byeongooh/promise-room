'use client';

import type React from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { db } from '../../../lib/firebase';
import {
  Timestamp,
  arrayUnion,
  arrayRemove, // ✅ 참여 취소에 필요
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

import { useUser } from '../../../lib/user-context';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Clock,
  Loader2,
  Lock,
  Map,
  MapPin,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

// 실제 있는 컴포넌트만 import (없으면 아래 fallback 사용)
import ParticipantList from '../../../components/participant-list';
import JoinForm from '../../../components/join-form';

// Fallback(있는 파일만 사용)
import FallbackUserLogin from '../../../components/fallback/FallbackUserLogin';

// 카드/다이얼로그
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';

// ================= 타입 =================
interface PromiseData {
  id?: string;
  title: string;
  date: string | Timestamp;
  time: string;
  location: string;
  penalty: string;
  creator: string;
  participants: string[];
  password: string;
  createdAt?: Timestamp;
}

// ================= Fallback =================
const DefaultFallbackUserLogin = () => <div>Please log in via Fallback.</div>;
const DefaultFallbackParticipantList = ({ participants }: { participants: string[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>참여자 ({participants?.length ?? 0})</CardTitle>
    </CardHeader>
    <CardContent>
      <p>ParticipantList component not found</p>
    </CardContent>
  </Card>
);
const DefaultFallbackJoinForm = ({
  isParticipant,
  onJoin,
}: {
  isParticipant: boolean;
  onJoin: (name: string) => Promise<void>;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>참여</CardTitle>
    </CardHeader>
    <CardContent>
      <p>JoinForm component not found</p>
    </CardContent>
  </Card>
);

// 실제/대체 매핑
const UserLoginComponent = FallbackUserLogin ?? DefaultFallbackUserLogin;
const ParticipantListComponent = ParticipantList ?? DefaultFallbackParticipantList;
const JoinFormComponent = JoinForm ?? DefaultFallbackJoinForm;

// ================= 페이지 =================
export default function PromisePage() {
  const [promiseId, setPromiseId] = useState<string>('');
  const [promiseData, setPromiseData] = useState<PromiseData | null>(null);
  const { currentUser } = useUser();
  const [hasAccess, setHasAccess] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alarm10Min, setAlarm10Min] = useState(false);
  const [alarm1Hour, setAlarm1Hour] = useState(false);

  // ========== Firestore에서 문서 로드 ==========
  const fetchPromiseData = async (id: string) => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const ref = doc(db, 'promises', id);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as PromiseData;
        const safeParticipants = Array.isArray(data.participants) ? data.participants : [];
        setPromiseData({ ...data, id: snap.id, participants: safeParticipants });

        // 로그인된 사용자가 방장 or 이미 참여자면 비번 없이 접근
        if (currentUser !== undefined && currentUser !== null) {
          const isCreator = data.creator === currentUser;
          const isParticipant = safeParticipants.includes(currentUser);
          setHasAccess(isCreator || isParticipant);
        } else {
          setHasAccess(false);
        }
      } else {
        setPromiseData(null);
        setHasAccess(false);
      }
    } catch (e) {
      console.error(e);
      setPromiseData(null);
      setHasAccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  // URL에서 ID 추출
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = window.location.pathname.split('/').pop() || '';
      if (id) {
        setPromiseId(id);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  // ID 또는 사용자 상태가 확정되면 로드
  useEffect(() => {
    if (promiseId && currentUser !== undefined) {
      fetchPromiseData(promiseId);
    } else if (!promiseId) {
      setIsLoading(false);
    }
  }, [promiseId, currentUser]);

  // ========== 비밀번호 제출 (이제는 보기 권한만) ==========
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promiseData || !promiseId) return;

    if (passwordInput === promiseData.password) {
      setPasswordError(false);
      // ❗ 여기서는 참가 X, 그냥 접근만 허용
      setHasAccess(true);
    } else {
      setPasswordError(true);
    }
  };

  // ========== 실제 참여하기 ==========
  const handleJoinPromise = async () => {
    if (!promiseData || !promiseId) return;
    if (!currentUser) {
      alert('로그인 후 참여할 수 있습니다.');
      return;
    }
    if (promiseData.participants.includes(currentUser)) {
      alert('이미 이 약속에 참여 중입니다.');
      return;
    }

    setIsJoining(true);
    try {
      await updateDoc(doc(db, 'promises', promiseId), {
        participants: arrayUnion(currentUser),
      });

      setPromiseData((prev) =>
        prev
          ? { ...prev, participants: [...prev.participants, currentUser] }
          : prev
      );

      alert('약속에 참여되었습니다.');
    } catch (err) {
      console.error(err);
      alert('약속에 참여하는 중 오류가 발생했습니다.');
    } finally {
      setIsJoining(false);
    }
  };

  // ========== 참여 취소 ==========
  const handleLeavePromise = async () => {
    if (!promiseData || !promiseId) return;
    if (!currentUser) {
      alert('로그인 후 취소할 수 있습니다.');
      return;
    }

    if (!promiseData.participants.includes(currentUser)) {
      alert('이 약속에 아직 참여하지 않았습니다.');
      return;
    }

    try {
      await updateDoc(doc(db, 'promises', promiseId), {
        participants: arrayRemove(currentUser),
      });

      setPromiseData((prev) =>
        prev
          ? {
              ...prev,
              participants: prev.participants.filter((p) => p !== currentUser),
            }
          : prev
      );

      alert('약속 참여가 취소되었습니다.');
    } catch (err) {
      console.error(err);
      alert('참여 취소 중 오류가 발생했습니다.');
    }
  };

  // ========== 삭제 ==========
  const handleDelete = async () => {
    if (!isDeleting && currentUser && promiseId && promiseData?.creator === currentUser) {
      setIsDeleting(true);
      try {
        await deleteDoc(doc(db, 'promises', promiseId));
        window.location.href = '/';
      } catch (err) {
        console.error(err);
        alert('약속 삭제 중 오류가 발생했습니다.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // ========== 렌더링 시작 ==========
  if (isLoading || currentUser === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">로딩 중...</span>
      </div>
    );
  }

  // 문서 없음
  if (!promiseData && !isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            약속을 찾을 수 없습니다 (ID: {promiseId || '없음'})
          </p>
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" /> 대시보드
            </Link>
          </Button>
          {!currentUser && (
            <div className="mt-4">
              <UserLoginComponent />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 🔐 비밀번호 입력 화면
  if (promiseData && !hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md sm:max-w-lg rounded-2xl shadow-lg border">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Lock className="w-6 h-6 text-primary" />
              <CardTitle className="text-2xl">비밀번호 입력</CardTitle>
            </div>
            <CardDescription className="text-base">
              "{promiseData.title}" 약속은 비밀번호로 보호되어 있습니다.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(false);
                  }}
                  autoFocus
                  className="text-lg py-2"
                />
                {passwordError && (
                  <p className="text-sm text-destructive">비밀번호가 올바르지 않습니다</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-1/3"
                  onClick={() => (window.location.href = '/')}
                >
                  취소
                </Button>
                <Button type="submit" className="w-2/3">
                  확인
                </Button>
              </div>
            </form>

            {currentUser === null && (
              <p className="mt-4 text-sm text-center text-muted-foreground">
                참여하려면 먼저 <UserLoginComponent />
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ 약속 데이터 있고 접근 허용된 화면
  if (promiseData && hasAccess) {
    const isOwner = promiseData.creator === currentUser;
    const isParticipant = promiseData.participants.includes(currentUser || '');

    // 날짜 표시 변환
    let displayDate = '날짜 정보 없음';
    if (promiseData.date) {
      if (promiseData.date instanceof Timestamp) {
        try {
          displayDate = promiseData.date.toDate().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          });
        } catch (e) {
          console.error(e);
          displayDate = '날짜 변환 오류';
        }
      } else if (typeof promiseData.date === 'string') {
        try {
          const dateObj = new Date(promiseData.date + 'T00:00:00Z');
          if (!isNaN(dateObj.getTime())) {
            displayDate = dateObj.toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            });
          } else {
            displayDate = promiseData.date;
          }
        } catch (e) {
          console.error(e);
          displayDate = promiseData.date;
        }
      }
    }

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* 상단 바 */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" asChild>
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" /> 대시보드
              </Link>
            </Button>

            {isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    약속 삭제
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>삭제 확인</AlertDialogTitle>
                    <AlertDialogDescription>
                      정말 삭제하시겠습니까?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* 기본 정보 카드 */}
          <Card className="mb-8 animate-fade-in">
            <CardHeader>
              <CardTitle className="text-3xl font-bold mb-2">{promiseData.title}</CardTitle>
              <CardDescription>작성자: {promiseData.creator}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-lg">
                <CalendarDays className="w-5 h-5 text-primary" />
                <span>{displayDate}</span>
              </div>
              <div className="flex items-center gap-3 text-lg">
                <Clock className="w-5 h-5 text-primary" />
                <span>{promiseData.time || '시간 미정'}</span>
              </div>
              <div className="flex items-center gap-3 text-lg">
                <MapPin className="w-5 h-5 text-primary" />
                <span>{promiseData.location || '장소 미정'}</span>
              </div>
              <div className="flex items-center gap-3 text-lg">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                <span>벌칙: {promiseData.penalty || '없음'}</span>
              </div>

              {/* ✅ 참여 / 참여 취소 토글 */}
              {!isParticipant ? (
                <div className="pt-4">
                  <Button
                    onClick={handleJoinPromise}
                    disabled={isJoining || !currentUser}
                    className="w-full"
                  >
                    {isJoining ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        참여 중...
                      </>
                    ) : currentUser ? (
                      '이 약속에 참여하기'
                    ) : (
                      '로그인 후 참여하기'
                    )}
                  </Button>
                </div>
              ) : (
                <div className="pt-4 flex gap-2">
                  <div className="flex-1 rounded-md bg-green-50 text-green-700 text-sm flex items-center justify-center py-2">
                    ✅ 이 약속에 참여 중입니다.
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleLeavePromise}
                    className="whitespace-nowrap"
                  >
                    참여 취소
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 위치 공유 + 알림 설정 */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <Card className="animate-fade-in-delay">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="w-5 h-5" /> 위치 공유
                </CardTitle>
                <CardDescription>약속 장소 지도</CardDescription>
              </CardHeader>
              <CardContent>
                <img
                  src={`https://placehold.co/600x300/e2e8f0/64748b?text=Map+of+${encodeURIComponent(
                    promiseData.location || 'Unknown'
                  )}`}
                  alt={`Map: ${promiseData.location || 'Unknown'}`}
                  className="w-full h-48 object-contain rounded-md border bg-muted"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://placehold.co/600x300/fecaca/991b1b?text=Map+Error';
                    (e.target as HTMLImageElement).alt = 'Map Error';
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">지도 이미지 예시</p>
              </CardContent>
            </Card>

            <Card className="animate-fade-in-delay-more">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" /> 알림 설정
                </CardTitle>
                <CardDescription>알림 받기</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <Label htmlFor="alarm-10min" className="flex-1 cursor-pointer">
                    10분 전 알림
                  </Label>
                  <Switch id="alarm-10min" checked={alarm10Min} onCheckedChange={setAlarm10Min} />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <Label htmlFor="alarm-1hour" className="flex-1 cursor-pointer">
                    1시간 전 알림
                  </Label>
                  <Switch id="alarm-1hour" checked={alarm1Hour} onCheckedChange={setAlarm1Hour} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">알림 UI 예시 (동작 안 함)</p>
              </CardContent>
            </Card>
          </div>

          {/* 참여/참여자 */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>참여 상태</CardTitle>
              </CardHeader>
              <CardContent>
                {isParticipant ? (
                  <p className="text-green-600 font-semibold">✅ 이 약속에 참여 중입니다.</p>
                ) : (
                  <p className="text-muted-foreground">
                    아직 이 약속에 참여하지 않았습니다. 위쪽 버튼으로 참여하세요.
                  </p>
                )}
              </CardContent>
            </Card>

            <ParticipantListComponent participants={promiseData.participants} />
          </div>
        </div>
      </div>
    );
  }

  // 이론상 여기 안 옴
  console.error('Reached end of render logic without matching conditions.');
  return <div>오류가 발생했습니다.</div>;
}
