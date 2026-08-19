"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// ✅ NextAuth
import { useSession } from "next-auth/react";

import type { MemberRoute, PromiseData, PromiseMember } from "../../../lib/types";
import { toCanonicalUid } from "../../../lib/uid";
import {
  isPromiseOwner,
  isPromiseParticipant,
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
import TravelTime, { type DrawnRoute } from "../../../components/travel-time";
import PromiseMap from "../../../components/promise-map";
import MemberBoard from "../../../components/member-board";
import DepartureBlock from "../../../components/departure-block";
import PlaceCompare from "../../../components/place-compare";
import PlaceSuggestions from "../../../components/place-suggestions";
import DateVoteBoard from "../../../components/date-vote";
import OnlineMeetingCard from "../../../components/online-meeting-card";
import OriginPicker from "../../../components/origin-picker";
import { displayWhere, isOnline } from "../../../lib/meeting-mode";
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
  // 아래 "얼마나 걸릴까"에서 고른 경로. 위 지도에 그린다.
  const [mapRoute, setMapRoute] = useState<DrawnRoute | null>(null);

  // 매번 새 객체를 만들면 아래 컴포넌트가 소요시간을 다시 계산한다.
  const destinationCoord = useMemo(() => {
    const lat = promiseData?.locationLat;
    const lng = promiseData?.locationLng;
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat: lat as number, lng: lng as number }
      : null;
  }, [promiseData?.locationLat, promiseData?.locationLng]);
  // 참여자가 아닐 때 비밀번호 화면에 쓸 최소 정보 (제목만)
  const [summary, setSummary] = useState<PromiseSummary | null>(null);

  // 서버에 저장해둔 내 경로. 아래 "어떻게 갈까"를 이 값으로 시작해야 해서,
  // 다 읽기 전에는 그 칸을 그리지 않는다 (나중에 오면 되살릴 수 없다).
  const [myRoute, setMyRoute] = useState<MemberRoute | null>(null);
  const [myLeaveAt, setMyLeaveAt] = useState<string | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);

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

        // 지난번에 고른 경로. 보안 규칙을 아직 배포하지 않았으면 못 읽는데,
        // 그건 길찾기를 막을 이유가 아니라서 조용히 빈 값으로 넘어간다.
        const uid = toCanonicalUid(currentUserId);
        if (uid) {
          try {
            const mine = await getDoc(doc(db, "promises", id, "members", uid));
            const m = mine.exists() ? (mine.data() as PromiseMember) : null;
            setMyRoute(m?.route ?? null);
            setMyLeaveAt(m?.leaveAt ?? null);
          } catch (e) {
            console.warn("저장된 경로를 읽지 못함 (규칙 배포 전일 수 있음):", e);
            setMyRoute(null);
            setMyLeaveAt(null);
          }
        }
        setMemberLoaded(true);
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
    setMemberLoaded(true);
  };

  // Firebase 로그인까지 끝난 뒤에 조회한다 (그 전에 쏘면 권한 오류가 난다)
  useEffect(() => {
    if (!promiseId) return;
    if (!firebaseReady) return;
    setIsLoading(true);
    fetchPromiseData(promiseId).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promiseId, firebaseReady, currentUser]);

  // ✅ 삭제
  const handleDelete = async () => {
    if (!promiseData || !promiseId) return;

    if (!isPromiseOwner(promiseData, currentUserId, currentUser ?? undefined)) {
      alert("이 플랜은 만든 사람만 삭제할 수 있습니다.");
      return;
    }

    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await apiDeletePromise(promiseId);
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "플랜 삭제 중 오류가 발생했습니다.");
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
      alert("이미 이 플랜에 참여 중입니다.");
      return;
    }

    // 참여에는 비밀번호가 필요하므로 비밀번호 화면으로 되돌린다.
    setHasAccess(false);
  };

  // ========== 참여 취소 ==========
  const handleLeavePromise = async () => {
    if (!promiseData || !promiseId) return;

    if (!isPromiseParticipant(promiseData, currentUserId, currentUser ?? undefined)) {
      alert("이 플랜에 아직 참여하지 않았습니다.");
      return;
    }

    try {
      await apiLeavePromise(promiseId);
      alert("플랜 참여가 취소되었습니다.");
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
            플랜을 찾을 수 없습니다 (ID: {promiseId || "없음"})
          </p>
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" /> 홈
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!hasAccess || !promiseData) {
    // 링크를 받은 사람이 앱에서 처음 보는 화면이다.
    // 제목만 보여주고 날짜·장소·참여자 자리는 가려둔다 — 무엇이 가려졌는지
    // 보여줘야 "들어가면 뭘 볼 수 있는지"가 전달된다.
    //
    // 시안에는 4자리 숫자 키패드가 있었는데 넣지 않았다. 이 앱의 비밀번호는
    // "4자 이상 아무 문자"라(lib/password.ts) 키패드로 바꾸면 글자가 섞였거나
    // 5자 이상인 기존 약속에 아무도 못 들어간다.
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tk-ground)] p-5">
        <div className="w-full max-w-sm">
          <p className="tk-label mb-2 text-[var(--tk-faint)]">초대받은 플랜</p>
          <h1 className="tk-display mb-4 text-[var(--tk-ink)]">
            {summary?.title ?? promiseData?.title ?? "플랜"}
          </h1>

          {/* 가려진 것들 */}
          <div className="mb-3 space-y-2 rounded-xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-[var(--tk-line)]">
            {[68, 52, 44].map((w) => (
              <span
                key={w}
                aria-hidden="true"
                className="block h-3 rounded bg-[var(--tk-line)]"
                style={{ width: `${w}%` }}
              />
            ))}
            <p className="tk-caption pt-1 text-[var(--tk-faint)]">
              날짜 · 장소 · 누가 오는지는 들어간 뒤에 보여요
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-2.5">
            <Input
              id="password"
              type="password"
              inputMode="text"
              placeholder="비밀번호"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError(null);
              }}
              autoFocus
              disabled={isJoining}
              className="h-[52px] rounded-[12px] border-[var(--tk-line)] bg-[var(--tk-paper)]
                text-center text-[17px] tracking-[0.3em] placeholder:tracking-normal"
            />

            {passwordError && (
              <p className="tk-caption text-center text-[var(--tk-warn)]">{passwordError}</p>
            )}

            <button
              type="submit"
              disabled={isJoining || passwordInput.length === 0}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px]
                bg-[var(--tk-ink)] text-[15px] font-bold text-[var(--tk-paper)]
                transition hover:brightness-110
                disabled:bg-[var(--tk-disable)] disabled:text-[var(--tk-assistive)]"
            >
              {isJoining ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  확인 중…
                </>
              ) : (
                "들어가기"
              )}
            </button>

            <Button type="button" variant="ghost" className="h-11 w-full" asChild>
              <Link href="/">취소</Link>
            </Button>
          </form>

          <p className="tk-caption mt-5 text-center leading-relaxed text-[var(--tk-faint)]">
            들어가면 이제 참여자예요. 출발지만 정하면
            <br />몇 시에 나가야 하는지 알려드려요.
          </p>
          <p className="tk-caption mt-3 text-center text-[var(--tk-assistive)]">
            로그인 · {currentUser ?? "사용자"}
          </p>
        </div>
      </div>
    );
  }

  const isOwner = isPromiseOwner(promiseData, currentUserId, currentUser ?? undefined);
  const isParticipant = isPromiseParticipant(promiseData, currentUserId, currentUser ?? undefined);
  const displayCreatorName = promiseData.creatorName ?? promiseData.creator ?? "알 수 없음";

  // 온라인이면 오가는 시간이라는 개념이 없어서 지도·경로·장소 비교가 다 빠진다.
  const online = isOnline(promiseData);
  const dateUndecided = getPromiseDate(promiseData) === null;

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
            <ArrowLeft className="size-4" /> 홈
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
                  <AlertDialogTitle>이 플랜을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    참여자 모두에게서 사라지고 되돌릴 수 없어요.
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
                {displayWhere(promiseData)}
              </p>
            </div>

          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 border-l-2 border-dashed border-[var(--tk-line)] ${stubTone}`}
          >
            <span className="tk-dday text-[22px]">{countdown.badge}</span>
            <span className="tk-dday-sub opacity-80">{countdown.detail}</span>
          </div>
        </div>

        {/* 나가야 하는 시각 — 이 앱이 파는 값이라 지도보다 위에 둔다.
            온라인 플랜은 나갈 일이 없다. */}
        {!online && (
        <DepartureBlock
          leaveAt={myLeaveAt}
          route={myRoute}
          dateUndecided={getPromiseDate(promiseData) === null}
          onChange={() =>
            document.getElementById("how-to-go")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />
        )}

        {/* 온라인 플랜 — 지도 대신 들어갈 링크 */}
        {online && (
          <OnlineMeetingCard
            promise={promiseData}
            isOwner={isOwner}
            onChanged={() => fetchPromiseData(promiseId)}
          />
        )}

        {/* 약속 장소 — 경로를 고르면 이 지도 위에 그려진다.
            온라인 플랜에는 장소가 없고, 좌표가 없으면 그릴 지도도 없다. */}
        {!online && destinationCoord && (
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-2.5 tk-label text-[var(--tk-faint)]">
            {mapRoute ? "가는 길" : "플랜 장소"}
          </p>
          <PromiseMap
            destination={destinationCoord}
            destinationName={displayLocation(promiseData.location)}
            route={mapRoute?.segments ?? null}
            points={mapRoute?.points ?? null}
            className={`w-full overflow-hidden rounded-xl bg-[var(--tk-ground)] transition-[height]
              ${mapRoute ? "h-[22rem]" : "h-44"}`}
          />
          {mapRoute ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {mapRoute.segments
                .filter((s) => s.label)
                .map((s, i) => (
                  <span key={`${s.label}-${i}`} className="flex items-center gap-1.5">
                    <span
                      className="h-[3px] w-4 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    <span className="tk-caption text-[var(--tk-sub)]">{s.label}</span>
                  </span>
                ))}
              <span className="flex items-center gap-1.5">
                <span
                  className="h-[3px] w-4 rounded-full opacity-60"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg,#8894AE 0 4px,transparent 4px 7px)",
                  }}
                  aria-hidden="true"
                />
                <span className="tk-caption text-[var(--tk-faint)]">도보</span>
              </span>
            </div>
          ) : (
            <p className="tk-meta mt-2.5 font-medium text-[var(--tk-ink)]">
              {displayLocation(promiseData.location)}
            </p>
          )}
        </section>
        )}

        {/* 언제 만날까 — 날짜가 아직이거나, 이미 올라온 후보가 있을 때 */}
        {(dateUndecided || (promiseData.dateOptions?.length ?? 0) > 0) && (
          <DateVoteBoard
            promiseId={promiseId}
            options={promiseData.dateOptions ?? []}
            participantCount={promiseData.participantIds?.length ?? 0}
            isOwner={isOwner}
            myUid={currentUserId}
            onChanged={() => fetchPromiseData(promiseId)}
          />
        )}

        {/* 아래는 전부 "오가는 시간"에 기대는 것들이라 온라인 플랜에는 안 나온다. */}
        {!online && (
          <>
            {/* 장소가 아직 없으면 "어떻게 갈까" 칸이 안 나온다(잴 목적지가 없다).
                그 칸 안에서만 출발지를 정할 수 있었기 때문에, 장소 미정일 때는
                출발지를 넣을 방법이 통째로 사라진다 — 하필 후보를 견주려면
                출발지가 가장 필요한 순간이다. 그래서 따로 낸다. */}
            {!destinationCoord && (
              <OriginPicker
                promiseId={promiseId}
                promiseData={promiseData}
                myUid={currentUserId}
              />
            )}

            {/* 올라온 장소 제안 — 있을 때만 보인다 */}
            <PlaceSuggestions
              promiseId={promiseId}
              suggestions={promiseData.placeSuggestions ?? []}
              isOwner={isOwner}
              myUid={currentUserId}
              onChanged={() => fetchPromiseData(promiseId)}
            />

            {/* 다 같이 편한 곳 찾기 — 계산은 누구나, 변경은 만든 사람만 */}
            <PlaceCompare
              promiseId={promiseId}
              currentPlace={{
                name: displayWhere(promiseData),
                lat: promiseData.locationLat ?? null,
                lng: promiseData.locationLng ?? null,
              }}
              isOwner={isOwner}
              onChanged={() => fetchPromiseData(promiseId)}
            />

            {/* 얼마나 걸리는지 — 저장된 경로를 다 읽은 뒤에 그려야 되살릴 수 있다.
                갈 곳이 정해지지 않았으면 잴 대상이 없다. */}
            {memberLoaded && destinationCoord && (
              <div id="how-to-go">
                <TravelTime
                  destination={destinationCoord}
                  destinationName={displayWhere(promiseData)}
                  onRouteChange={setMapRoute}
                  promiseId={promiseId}
                  savedRoute={myRoute}
                  meetingAt={getPromiseDate(promiseData)}
                  onSaved={(route, leaveAt) => {
                    // 경로를 고르는 즉시 위 출발 시각 블록이 따라 바뀌어야 한다.
                    setMyRoute(route);
                    setMyLeaveAt(leaveAt);
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* 참여자 — 누가 무엇을 타고 오는지, 지금 어디쯤인지 */}
        <MemberBoard
          promiseId={promiseId}
          promiseData={promiseData}
          myUid={currentUserId}
        />

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
            className="w-full bg-[var(--tk-gold)] py-6 text-[14px] font-bold text-[var(--tk-paper)] hover:bg-[var(--tk-gold)]/90"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                참여 중...
              </>
            ) : (
              "이 플랜에 참여하기"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
