"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import FallbackCreatePromiseForm from "@/components/fallback/FallbackCreatePromiseForm";
import FallbackUserLogin from "@/components/fallback/FallbackUserLogin";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import Link from "next/link";
import { useUser } from "@/lib/user-context";

import LocationPicker, { PickedLocation } from "@/components/location-picker";

// --- Firebase Firestore ---
import { db } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function CreatePage() {
  const router = useRouter();
  const { currentUser } = useUser();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const UserLoginComponent = FallbackUserLogin;
  const CreatePromiseFormComponent = FallbackCreatePromiseForm;

  if (!currentUser) {
    return <UserLoginComponent />;
  }

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
      console.error("Firestore db object is null. Check firebase initialization.");
      return;
    }
    if (!currentUser) {
      setError("로그인이 필요합니다.");
      return;
    }

    // ✅ 지도 선택 필수
    if (!pickedLocation) {
      setError("지도에서 장소를 선택해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const docRef = await addDoc(collection(db, "promises"), {
        title: promiseData.title,
        date: promiseData.date,
        time: promiseData.time,

        // ✅ 장소는 지도 선택값으로 저장
        location: pickedLocation.text,
        locationLat: pickedLocation.lat,
        locationLng: pickedLocation.lng,
        locationPlaceId: pickedLocation.placeId ?? null,


        penalty: promiseData.penalty,
        password: promiseData.password,

        creator: currentUser,
        participants: [currentUser],
        createdAt: serverTimestamp(),
      });

      console.log("Document written with ID: ", docRef.id);
      router.push(`/promise/${docRef.id}`);
    } catch (e) {
      console.error("Error adding document: ", e);
      setError("약속을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        </div>

        {/* ✅ 지도에서 장소 선택 (폼보다 위에 두는 걸 추천) */}
        <div className="mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="font-semibold mb-2">지도에서 장소 선택</p>
            <LocationPicker
              onSelect={(loc) => {
                setPickedLocation(loc);
                // 기존 에러가 "장소 선택" 관련이면 바로 지워줌
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

        {/* 약속 생성 폼 */}
        <CreatePromiseFormComponent onCreate={handleCreatePromise} currentUser={currentUser} />

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
