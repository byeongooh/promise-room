"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// ✅ NextAuth
import { useSession } from "next-auth/react";

import type { PromiseData } from "../../../lib/types";
import {
  isPromiseOwner,
  isPromiseParticipant,
  getParticipantNames,
} from "../../../lib/promise-permissions";

// 쓰기(참여/탈퇴/삭제)는 모두 서버 API를 거친다.
import {
  joinPromise as apiJoinPromise,
  leavePromise as apiLeavePromise,
  deletePromise as apiDeletePromise,
  fetchPromiseSummary,
  type PromiseSummary,
} from "../../../lib/api-client";
import { useFirebaseAuth } from "../../../components/firebase-auth-provider";
import SharePromise from "../../../components/share-promise";
import {
  displayLocation,
  formatWhen,
  getCountdown,
  getPromiseDate,
} from "../../../lib/promise-time";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Switch } from "../../../components/ui/switch";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Loader2,
  Lock,
  MapPin,
  ShieldAlert,
  Trash2,
} from "lucide-react";

// 카드/다이얼로그
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
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
} from "../../../components/ui/alert-dialog";

export default function PromisePage() {
  const router = useRouter();

  // ✅ status 꼭 같이 꺼내야 함
  const { data: session, status } = useSession();

  const currentUserId = session?.user?.id;

  // ✅ 현재 사용자 = 카카오 이름 (이걸로만 판단)
  const currentUser = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n && n.length > 0 ? n : null;
  }, [session?.user?.name]);

  const { ready: firebaseReady } = useFirebaseAuth();

  const [promiseId, setPromiseId] = useState<string>("");
  const [promiseData, setPromiseData] = useState<PromiseData | null>(null);
  // 참여자가 아닐 때 비밀번호 화면에 쓸 최소 정보 (제목만)
  const [summary, setSummary] = useState<PromiseSummary | null>(null);

  // 접근 제어
  const [hasAccess, setHasAccess] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  // ✅ isDeleting 한 번만!
  const [isDeleting, setIsDeleting] = useState(false);

  const [alarm10Min, setAlarm10Min] = useState(false);
  const [alarm1Hour, setAlarm1Hour] = useState(false);

  // ✅ 로그인 안 되어있으면 /login
  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [status, session, router]);

  // URL에서 ID 추출
  useEffect(() => {
    if (typeof window !== "undefined") {
      const id = window.location.pathname.split("/").pop() || "";
      if (id) setPromiseId(id);
      else setIsLoading(false);
    }
  }, []);

  // ========== Firestore에서 문서 로드 ==========
  // 참여자가 아니면 문서를 아예 읽을 수 없다(permission-denied).
  // 그 경우 서버 요약 API로 제목만 받아 비밀번호 화면을 그린다.
  const fetchPromiseData = async (id: string) => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "promises", id));
      if (snap.exists()) {
        const merged: PromiseData = { ...(snap.data() as PromiseData), id: snap.id };
        setPromiseData(merged);
        setHasAccess(
          isPromiseOwner(merged, currentUserId, currentUser ?? undefined) ||
            isPromiseParticipant(merged, currentUserId, currentUser ?? undefined)
        );
        return;
      }
    } catch (e) {
      console.warn("문서 직접 조회 실패 — 요약으로 전환:", e);
    }

    // 여기 오면 참여자가 아니거나 문서가 없다.
    try {
      const s = await fetchPromiseSummary(id);
      setSummary(s);
      setPromiseData(null);
      setHasAccess(false);
    } catch {
      setSummary(null);
      setPromiseData(null);
      setHasAccess(false);
    }
  };

  // Firebase 로그인까지 끝난 뒤에 조회한다 (그 전에 쏘면 권한 오류가 난다)
  useEffect(() => {
    if (!promiseId) return;
    if (!firebaseReady) return;
    setIsLoading(true);
    fetchPromiseData(promiseId).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promiseId, firebaseReady, currentUser]);

  // ================= 📍 카카오 지도 표시 =================
  useEffect(() => {
    if (!hasAccess || !promiseData?.location) return;

    const kakao = (window as any).kakao;
    if (!kakao?.maps) return;

    kakao.maps.load(() => {
      const container = document.getElementById("kakao-map");
      if (!container) return;
      container.innerHTML = "";

      const map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 3,
      });

      const lat = (promiseData as any).locationLat;
      const lng = (promiseData as any).locationLng;

      if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        const pos = new kakao.maps.LatLng(lat, lng);
        const marker = new kakao.maps.Marker({ map, position: pos });
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 8px;font-size:12px;">${promiseData.location}</div>`,
        });
        infowindow.open(map, marker);
        map.setCenter(pos);
        map.setLevel(3);
        return;
      }

      if (!kakao.maps.services) return;

      const places = new kakao.maps.services.Places();
      places.keywordSearch(promiseData.location, (result: any, status2: any) => {
        if (status2 !== kakao.maps.services.Status.OK || !result?.length) return;
        const first = result[0];
        const pos = new kakao.maps.LatLng(Number(first.y), Number(first.x));
        const marker = new kakao.maps.Marker({ map, position: pos });
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:6px 8px;font-size:12px;">${promiseData.location}</div>`,
        });
        infowindow.open(map, marker);
        map.setCenter(pos);
        map.setLevel(3);
      });
    });
  }, [hasAccess, promiseData?.location, (promiseData as any)?.locationLat, (promiseData as any)?.locationLng]);

  // ✅ 삭제
  const handleDelete = async () => {
    if (!promiseData || !promiseId) return;

    if (!isPromiseOwner(promiseData, currentUserId, currentUser ?? undefined)) {
      alert("이 약속은 만든 사람만 삭제할 수 있습니다.");
      return;
    }

    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await apiDeletePromise(promiseId);
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "약속 삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ========== 비밀번호 제출 ==========
  // 비밀번호는 서버에서만 대조한다. 맞으면 그 자리에서 참여자로 등록된다
  // (참여자만 약속을 읽을 수 있으므로 "참여 없이 열람"은 존재할 수 없다).
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promiseId || isJoining) return;

    setIsJoining(true);
    setPasswordError(null);
    try {
      await apiJoinPromise(promiseId, passwordInput);
      setPasswordInput("");
      await fetchPromiseData(promiseId);
      setHasAccess(true);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "비밀번호가 올바르지 않습니다."
      );
    } finally {
      setIsJoining(false);
    }
  };

  // ========== 참여하기 ==========
  const handleJoinPromise = async () => {
    if (!promiseData || !promiseId) return;

    if (isPromiseParticipant(promiseData, currentUserId, currentUser ?? undefined)) {
      alert("이미 이 약속에 참여 중입니다.");
      return;
    }

    // 참여에는 비밀번호가 필요하므로 비밀번호 화면으로 되돌린다.
    setHasAccess(false);
  };

  // ========== 참여 취소 ==========
  const handleLeavePromise = async () => {
    if (!promiseData || !promiseId) return;

    if (!isPromiseParticipant(promiseData, currentUserId, currentUser ?? undefined)) {
      alert("이 약속에 아직 참여하지 않았습니다.");
      return;
    }

    try {
      await apiLeavePromise(promiseId);
      alert("약속 참여가 취소되었습니다.");
      router.push("/");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "참여 취소 중 오류가 발생했습니다.");
    }
  };

  // ========== 렌더링 ==========
  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">로딩 중...</span>
      </div>
    );
  }

  if (!session) return null;

  // 문서도 못 읽고 요약도 못 받았다면 없는 약속이다.
  if (!promiseData && !summary) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            약속을 찾을 수 없습니다 (ID: {promiseId || "없음"})
          </p>
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" /> 대시보드
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!hasAccess || !promiseData) {
    return (
      <div className="min-h-screen bg-[var(--tk-ground)] flex items-center justify-center p-6">
        <Card className="w-full max-w-md rounded-2xl border-0 bg-[var(--tk-paper)] shadow-sm ring-1 ring-black/5">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Lock className="w-5 h-5 text-[var(--tk-gold)]" />
              <CardTitle className="text-xl text-[var(--tk-ink)]">비밀번호 입력</CardTitle>
            </div>
            <CardDescription className="text-base">
              "{summary?.title ?? promiseData?.title}" 약속에 참여하려면 비밀번호가 필요합니다.
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
                    setPasswordError(null);
                  }}
                  autoFocus
                  className="text-lg py-2"
                  disabled={isJoining}
                />
                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="w-1/3" asChild>
                  <Link href="/">취소</Link>
                </Button>
                <Button type="submit" className="w-2/3" disabled={isJoining}>
                  {isJoining ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      확인 중...
                    </>
                  ) : (
                    "확인하고 참여하기"
                  )}
                </Button>
              </div>
            </form>

            <p className="mt-4 text-xs text-center text-muted-foreground">
              로그인: <b>{currentUser ?? "사용자"}</b>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = isPromiseOwner(promiseData, currentUserId, currentUser ?? undefined);
  const isParticipant = isPromiseParticipant(promiseData, currentUserId, currentUser ?? undefined);
  const displayCreatorName = promiseData.creatorName ?? promiseData.creator ?? "알 수 없음";
  const participantNames = getParticipantNames(promiseData);


  const countdown = getCountdown(getPromiseDate(promiseData));
  const stubTone =
    countdown.tone === "now"
      ? "bg-[var(--tk-now-bg)] text-[var(--tk-now-ink)]"
      : countdown.tone === "soon"
        ? "bg-[var(--tk-hot-bg)] text-[var(--tk-hot-ink)]"
        : "bg-[var(--tk-paper)] text-[var(--tk-faint)]";

  return (
    <div className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-lg px-4 py-5">
        {/* 상단 바 */}
        {/* 손가락으로 누르는 화면이라 항목 높이를 44px 이상으로 잡는다 */}
        <div className="mb-2 flex items-center justify-between">
          <Link
            href="/"
            className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--tk-sub)] hover:text-[var(--tk-ink)]"
          >
            <ArrowLeft className="size-4" /> 대시보드
          </Link>

          <div className="flex items-center gap-2">
            <SharePromise promiseId={promiseId} title={promiseData.title} />

            {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isDeleting}
                  className="h-11 border-[var(--tk-warn)]/40 text-[var(--tk-warn)] hover:bg-[var(--tk-warn)]/8 hover:text-[var(--tk-warn)]"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-1.5" />
                  )}
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>이 약속을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    참여자 모두에게서 사라지고 되돌릴 수 없습니다.
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
        </div>

        {/* 히어로 티켓 */}
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_6rem] overflow-hidden rounded-2xl bg-[var(--tk-paper)] shadow-sm ring-1 ring-black/5">
          <div className="min-w-0 p-5">
            <h1 className="tk-display text-[var(--tk-ink)]">{promiseData.title}</h1>
            <p className="tk-caption mt-1 text-[var(--tk-faint)]">
              만든 사람 · {displayCreatorName}
            </p>

            <div className="mt-3 space-y-1 text-[var(--tk-sub)]">
              <p className="tk-meta flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 opacity-60" />
                {formatWhen(getPromiseDate(promiseData))}
              </p>
              <p className="tk-meta flex items-center gap-2">
                <MapPin className="size-4 shrink-0 opacity-60" />
                {displayLocation(promiseData.location)}
              </p>
            </div>

            {promiseData.penalty?.trim() ? (
              <p className="tk-note mt-2.5 flex items-center gap-2 text-[var(--tk-warn)]">
                <ShieldAlert className="size-4 shrink-0" />
                지각 시 · {promiseData.penalty}
              </p>
            ) : null}
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 border-l-2 border-dashed border-[var(--tk-line)] ${stubTone}`}
          >
            <span className="tk-dday text-[22px]">{countdown.badge}</span>
            <span className="tk-dday-sub opacity-80">{countdown.detail}</span>
          </div>
        </div>

        {/* 약속 장소 */}
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-2.5 tk-label text-[var(--tk-faint)]">
            약속 장소
          </p>
          <div
            id="kakao-map"
            className="h-44 w-full overflow-hidden rounded-xl bg-[var(--tk-ground)]"
          />
          <p className="tk-meta mt-2.5 font-medium text-[var(--tk-ink)]">
            {displayLocation(promiseData.location)}
          </p>
        </section>

        {/* 참여자 */}
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 tk-label text-[var(--tk-faint)]">
            참여자 {participantNames.length}명
          </p>
          {participantNames.length === 0 ? (
            <p className="tk-meta py-2 text-[var(--tk-faint)]">아직 참여자가 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {participantNames.map((n, i) => (
                <li key={`${n}-${i}`} className="flex items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--tk-ground)] text-[12px] font-bold text-[var(--tk-ink)]">
                    {n.trim().charAt(0) || "?"}
                  </span>
                  <span className="tk-meta font-medium text-[var(--tk-ink)]">{n}</span>
                  {n === displayCreatorName && (
                    <span className="tk-caption text-[var(--tk-faint)]">약속 생성자</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 알림 (아직 동작하지 않음) */}
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 flex items-center gap-1.5 tk-label text-[var(--tk-faint)]">
            <Bell className="size-3.5" /> 알림
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-[var(--tk-ground)] px-3.5 py-2.5">
              <Label htmlFor="alarm-10min" className="tk-meta cursor-pointer">
                10분 전에 알려주기
              </Label>
              <Switch id="alarm-10min" checked={alarm10Min} onCheckedChange={setAlarm10Min} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[var(--tk-ground)] px-3.5 py-2.5">
              <Label htmlFor="alarm-1hour" className="tk-meta cursor-pointer">
                1시간 전에 알려주기
              </Label>
              <Switch id="alarm-1hour" checked={alarm1Hour} onCheckedChange={setAlarm1Hour} />
            </div>
          </div>
          <p className="tk-caption mt-2.5 text-[var(--tk-faint)]">
            아직 실제로 알림이 오지는 않습니다. 앱으로 만들 때 연결됩니다.
          </p>
        </section>

        {/* 참여 / 참여 취소 */}
        {isParticipant ? (
          <Button
            variant="outline"
            onClick={handleLeavePromise}
            className="w-full border-[var(--tk-line)] bg-transparent py-6 text-[14px] font-bold text-[var(--tk-sub)]"
          >
            참여 취소
          </Button>
        ) : (
          <Button
            onClick={handleJoinPromise}
            disabled={isJoining}
            className="w-full bg-[var(--tk-gold)] py-6 text-[14px] font-bold text-[var(--tk-ink)] hover:bg-[var(--tk-gold)]/90"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                참여 중...
              </>
            ) : (
              "이 약속에 참여하기"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
