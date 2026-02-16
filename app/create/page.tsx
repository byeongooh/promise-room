"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import Link from "next/link";

import LocationPicker, { PickedLocation } from "@/components/location-picker";

// --- Firebase Firestore ---
import { db } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// ✅ NextAuth
import { useSession } from "next-auth/react";

import FallbackCreatePromiseForm from "@/components/fallback/FallbackCreatePromiseForm";

export default function CreatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const currentUser = useMemo(() => {
    const n = session?.user?.name?.trim();
    return n && n.length > 0 ? n : null;
  }, [session?.user?.name]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ 로그인 안 되어 있으면 /login
  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [status, session, router]);

  // Firestore에 데이터 저장하는 함수
const handleCreatePromise = async (promiseData: {
  title: string;
  date: string;
  time: string;
  penalty: string;
  password: string;
}) => {
  if (!db) {
    setError("Firestore 데이터베이스에 연결할 수 없습니다. lib/firebase.ts 파일을 확인하세요.");
    return;
  }

  // ✅ userId는 이제 필수 (안정 ID)
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    setError("로그인 사용자 ID를 가져올 수 없습니다. (session.user.id)");
    return;
  }

  // ✅ 표시 이름은 아직 필요 (UI용)
  if (!currentUser) {
    setError("카카오 로그인 정보(이름)를 가져올 수 없습니다.");
    return;
  }

  if (!pickedLocation) {
    setError("지도에서 장소를 선택해주세요.");
    return;
  }

  setIsSubmitting(true);
  setError(null);

  try {
    const payload = {
      // ---------- 공통 ----------
      title: promiseData.title,
      date: promiseData.date, // (2단계에서 Timestamp로 바꾸자)
      time: promiseData.time,

      // 장소
      location: pickedLocation.text,
      locationLat: pickedLocation.lat,
      locationLng: pickedLocation.lng,
      locationPlaceId: pickedLocation.placeId ?? null,

      penalty: promiseData.penalty,
      password: promiseData.password,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      // ---------- v2: ID 기반 ----------
      creatorId: userId,
      creatorName: currentUser,
      participantIds: [userId],
      participantNames: [currentUser],
      status: "active",

      // ---------- v1(레거시): 기존 화면 안 깨지게 유지 ----------
      creator: currentUser,
      participants: [currentUser],
    };

    const docRef = await addDoc(collection(db, "promises"), payload);
    router.push(`/promise/${docRef.id}`);
  } catch (e) {
    console.error("Error adding document: ", e);
    setError("약속을 저장하는 중 오류가 발생했습니다.");
  } finally {
    setIsSubmitting(false);
  }
};


  // 로딩 중
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            로딩 중…
          </div>
        </div>
      </div>
    );
  }

  // 인증 안 된 경우 (useEffect가 /login 보내지만 깜빡임 방지)
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* 뒤로가기 */}
        <Link href="/" passHref>
          <Button variant="ghost" className="mb-6" disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            대시보드로 돌아가기
          </Button>
        </Link>

        {/* 제목 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Calendar className="w-10 h-10 text-primary" />
            <h1 className="text-3xl font-bold">새로운 약속 만들기</h1>
          </div>
          <p className="text-muted-foreground">친구들과 함께할 약속을 생성하세요</p>
          <p className="mt-2 text-sm text-muted-foreground">
            현재 로그인: <b>{currentUser ?? "사용자"}</b>
          </p>
        </div>

        {/* ✅ 지도에서 장소 선택 */}
        <div className="mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="font-semibold mb-2">지도에서 장소 선택</p>
            <LocationPicker
              onSelect={(loc) => {
                setPickedLocation(loc);
                setError((prev) => (prev?.includes("지도에서 장소") ? null : prev));
              }}
            />

            <div className="mt-3 text-sm text-muted-foreground">
              {pickedLocation ? (
                <span>
                  선택됨: <b>{pickedLocation.text}</b> ({pickedLocation.lat.toFixed(5)},{" "}
                  {pickedLocation.lng.toFixed(5)})
                </span>
              ) : (
                <span>아직 선택된 장소가 없습니다. 지도에서 클릭/검색해서 선택하세요.</span>
              )}
            </div>
          </div>
        </div>

        {/* 약속 생성 폼 (컴포넌트는 그대로 재사용) */}
        <FallbackCreatePromiseForm onCreate={handleCreatePromise} currentUser={currentUser} />

        {/* 로딩 */}
        {isSubmitting && (
          <div className="mt-4 flex items-center justify-center text-primary">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>약속을 저장하는 중...</span>
          </div>
        )}

        {/* 오류 */}
        {error && (
          <div className="mt-4 p-4 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
