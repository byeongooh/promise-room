"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";

import LocationPicker, { PickedLocation } from "@/components/location-picker";

// 약속 생성은 서버 API를 거친다 (비밀번호를 해시로 저장해야 하므로).
import { createPromise } from "@/lib/api-client";

// ✅ NextAuth
import { useSession } from "next-auth/react";

import FallbackCreatePromiseForm from "@/components/fallback/FallbackCreatePromiseForm";

export default function CreatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

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
  password: string;
}) => {
  if (!pickedLocation) {
    setError("지도에서 장소를 선택해주세요.");
    return;
  }

  setIsSubmitting(true);
  setError(null);

  try {
    const { id } = await createPromise({
      title: promiseData.title,
      date: promiseData.date,
      time: promiseData.time,

      location: pickedLocation.text,
      locationLat: pickedLocation.lat,
      locationLng: pickedLocation.lng,
      locationPlaceId: pickedLocation.placeId ?? null,

      password: promiseData.password,
    });

    router.push(`/promise/${id}`);
  } catch (e) {
    console.error("약속 생성 실패:", e);
    setError(e instanceof Error ? e.message : "플랜을 저장하는 중 오류가 발생했습니다.");
  } finally {
    setIsSubmitting(false);
  }
};


  // 로딩 중
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

  // 인증 안 된 경우 (useEffect가 /login 보내지만 깜빡임 방지)
  if (!session) return null;

  return (
    <div className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-lg px-4 py-5">
        <Link
          href="/"
          className="-ml-2 mb-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--tk-sub)] hover:text-[var(--tk-ink)]"
        >
          <ArrowLeft className="size-4" /> 홈
        </Link>

        <h1 className="text-[22px] font-extrabold tracking-tight text-balance break-keep text-[var(--tk-ink)]">
          새 플랜 만들기
        </h1>
        <p className="mt-1 mb-4 text-[13px] text-[var(--tk-sub)]">
          장소를 고르고 정보를 채우면 플랜 한 장이 만들어져요.
        </p>

        {/* 1단계 — 장소 */}
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 flex items-center gap-2 tk-label text-[var(--tk-faint)]">
            <span className="grid size-[18px] place-items-center rounded-full bg-[var(--tk-ink)] text-[10px] text-[var(--tk-paper)]">
              1
            </span>
            어디서 만날까요
          </p>

          <LocationPicker
            onSelect={(loc) => {
              setPickedLocation(loc);
              setError((prev) => (prev?.includes("지도에서 장소") ? null : prev));
            }}
          />

          <div
            className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] ${
              pickedLocation
                ? "bg-[var(--tk-hot-bg)] text-[var(--tk-hot-ink)]"
                : "bg-[var(--tk-ground)] text-[var(--tk-faint)]"
            }`}
          >
            <MapPin className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {pickedLocation ? pickedLocation.text : "지도를 눌러 장소를 골라주세요"}
            </span>
          </div>
        </section>

        {/* 2단계 — 약속 정보 */}
        <section className="rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 flex items-center gap-2 tk-label text-[var(--tk-faint)]">
            <span className="grid size-[18px] place-items-center rounded-full bg-[var(--tk-ink)] text-[10px] text-[var(--tk-paper)]">
              2
            </span>
            무슨 플랜인가요
          </p>
          <FallbackCreatePromiseForm onCreate={handleCreatePromise} isSubmitting={isSubmitting} />
        </section>

        {error && (
          <div className="mt-3 rounded-xl border border-[var(--tk-warn)]/30 bg-[var(--tk-warn)]/8 px-4 py-3 text-[13px] text-[var(--tk-warn)]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
