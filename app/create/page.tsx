"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowLeft, MapPin, Video } from "lucide-react";
import Link from "next/link";

import LocationPicker, { PickedLocation } from "@/components/location-picker";

// 약속 생성은 서버 API를 거친다 (비밀번호를 해시로 저장해야 하므로).
import { createPromise } from "@/lib/api-client";
import { meetingServiceName, safeMeetingUrl, type MeetingMode } from "@/lib/meeting-mode";

// ✅ NextAuth
import { useSession } from "next-auth/react";

import FallbackCreatePromiseForm from "@/components/fallback/FallbackCreatePromiseForm";

export default function CreatePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 어떻게 만나는가. 온라인이면 장소·이동시간이라는 개념이 통째로 빠진다.
  const [mode, setMode] = useState<MeetingMode>("inPerson");
  // 직접 만나는데 어디서 볼지는 아직 안 정한 경우. 날짜 미정과 같은 상황이다.
  const [placeUndecided, setPlaceUndecided] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");

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
  const online = mode === "online";
  const link = online ? safeMeetingUrl(meetingUrl) : null;

  if (online && meetingUrl.trim() && !link) {
    setError("링크는 http:// 또는 https:// 로 시작해야 해요.");
    return;
  }
  if (!online && !placeUndecided && !pickedLocation) {
    setError("지도에서 장소를 고르거나 \"장소는 나중에\"를 눌러주세요.");
    return;
  }

  setIsSubmitting(true);
  setError(null);

  try {
    // 온라인이면 좌표가 없다. 장소 미정도 마찬가지다. 둘 다 빈 값으로 두고
    // 화면에서 "정하는 중"으로 읽는다(lib/meeting-mode.ts).
    const place = online || placeUndecided ? null : pickedLocation;

    const { id } = await createPromise({
      title: promiseData.title,
      date: promiseData.date,
      time: promiseData.time,

      meetingMode: mode,
      meetingUrl: link,
      location: place?.text ?? "",
      locationLat: place?.lat,
      locationLng: place?.lng,
      locationPlaceId: place?.placeId ?? null,

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
          어떻게 만날지 고르고 정보를 채우면 플랜 한 장이 만들어져요.
        </p>

        {/* 1단계 — 장소 */}
        <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 flex items-center gap-2 tk-label text-[var(--tk-faint)]">
            <span className="grid size-[18px] place-items-center rounded-full bg-[var(--tk-ink)] text-[10px] text-[var(--tk-paper)]">
              1
            </span>
            어떻게 만날까요
          </p>

          {/* 직접 / 온라인. 이 선택이 화면 절반을 좌우한다 — 온라인 플랜에는
              이동시간이라는 개념이 없어서 출발지·경로·장소 비교가 다 빠진다. */}
          <div className="mb-3 flex gap-1.5">
            {(["inPerson", "online"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`h-11 flex-1 rounded-xl text-[13px] font-bold transition ${
                  mode === m
                    ? "bg-[var(--tk-ink)] text-[var(--tk-paper)]"
                    : "bg-[var(--tk-ground)] text-[var(--tk-ink)] hover:brightness-95"
                }`}
              >
                {m === "inPerson" ? "직접 만나기" : "온라인"}
              </button>
            ))}
          </div>

          {mode === "online" ? (
            <>
              <input
                type="url"
                inputMode="url"
                value={meetingUrl}
                onChange={(e) => {
                  setMeetingUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://zoom.us/j/… (나중에 넣어도 돼요)"
                className="h-11 w-full rounded-xl bg-[var(--tk-ground)] px-3.5 text-[14px]
                  text-[var(--tk-ink)] outline-none placeholder:text-[var(--tk-faint)]"
              />
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--tk-ground)] px-3 py-2.5 text-[13px] text-[var(--tk-faint)]">
                <Video className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {safeMeetingUrl(meetingUrl)
                    ? `${meetingServiceName(safeMeetingUrl(meetingUrl)!)}로 만나요`
                    : "줌 · 디스코드 · 구글 미트 링크를 넣어주세요"}
                </span>
              </div>
              <p className="tk-caption mt-2 text-[var(--tk-assistive)]">
                온라인 플랜은 오가는 시간이 없어서 출발지·경로 칸이 나오지 않아요.
              </p>
            </>
          ) : (
            <>
              <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-xl bg-[var(--tk-ground)] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={placeUndecided}
                  onChange={(e) => {
                    setPlaceUndecided(e.target.checked);
                    if (e.target.checked) setPickedLocation(null);
                    setError(null);
                  }}
                  className="size-4 accent-[var(--tk-ink)]"
                />
                <span className="tk-field-label text-[var(--tk-ink)]">
                  장소는 나중에 같이 정할래요
                </span>
              </label>

              {placeUndecided ? (
                <p className="tk-caption text-[var(--tk-faint)]">
                  플랜을 만든 뒤 <b className="text-[var(--tk-sub)]">다 같이 편한 곳 찾기</b>에서
                  후보를 견줘볼 수 있어요. 참여자들이 출발지를 정해둘수록 정확해져요.
                </p>
              ) : (
                <>
                  <LocationPicker
                    onSelect={(loc) => {
                      setPickedLocation(loc);
                      setError((prev) => (prev?.includes("장소") ? null : prev));
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
                </>
              )}
            </>
          )}
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
