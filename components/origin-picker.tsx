"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Bookmark, Check, Crosshair, Loader2, MapPin, Trash2 } from "lucide-react";

import OriginSearch, { type FoundPlace } from "@/components/origin-search";
import { db } from "@/lib/firebase";
import { updateMyMember } from "@/lib/api-client";
import { addMyPlace, listMyPlaces, removeMyPlace, type MyPlace } from "@/lib/my-places";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { PromiseData, PromiseMember } from "@/lib/types";

// 장소가 아직 안 정해졌을 때 "나는 여기서 출발할 것 같다"를 넣어두는 칸.
//
// 왜 따로 있나: 출발지는 원래 아래 "어떻게 갈까"에서 경로를 고르며 정한다.
// 그런데 그 칸은 목적지 좌표가 있어야 나온다 — 장소가 미정이면 잴 대상이
// 없기 때문이다. 그래서 장소 미정일 때는 출발지를 넣을 방법이 통째로
// 사라졌는데, 하필 그때가 출발지가 가장 필요한 순간이다. 후보 장소를
// 견주려면 참여자들의 출발지가 있어야 하고, 그게 없으면 "다 같이 편한 곳"을
// 계산할 표본 자체가 없다.
//
// 정한 사람 수를 같이 보여주는 이유도 같다. 3/5처럼 보이면 "두 명 더 넣으면
// 비교가 정확해진다"가 눈에 보여서, 재촉하지 않아도 채워진다.

export default function OriginPicker({
  promiseId,
  promiseData,
  myUid,
}: {
  promiseId: string;
  promiseData: PromiseData;
  myUid?: string;
}) {
  const [places, setPlaces] = useState<MyPlace[]>([]);
  const [members, setMembers] = useState<Record<string, PromiseMember>>({});
  const [blocked, setBlocked] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방금 저장한 곳. 서버 구독이 돌아오기 전에도 바로 보이게. */
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [searched, setSearched] = useState<FoundPlace | null>(null);

  useEffect(() => {
    setPlaces(listMyPlaces());
  }, []);

  // 참여자들의 출발지 현황. MemberBoard와 같은 구독이라 같은 주의사항이 붙는다 —
  // StrictMode가 effect를 붙였다 뗐다 하면 Firestore 내부 단언에 걸리므로
  // 한 프레임 미뤄서 리스너가 하나만 남게 한다.
  useEffect(() => {
    if (!promiseId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        collection(db, "promises", promiseId, "members"),
        (snap) => {
          setBlocked(false);
          const next: Record<string, PromiseMember> = {};
          snap.forEach((d) => {
            next[normalizeKakaoId(d.id) ?? d.id] = { ...(d.data() as PromiseMember), uid: d.id };
          });
          setMembers(next);
        },
        (err) => {
          console.warn("[origin-picker] 참여자 상태를 읽지 못함:", err.code);
          setBlocked(true);
        }
      );
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [promiseId]);

  const save = useCallback(
    async (origin: { label: string; lat: number; lng: number }) => {
      setSaving(true);
      setError(null);
      try {
        await updateMyMember(promiseId, { origin });
        setJustSaved(origin.label);
      } catch (err) {
        setError(err instanceof Error ? err.message : "출발지를 저장하지 못했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [promiseId]
  );

  const useCurrentPosition = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError("이 기기에서는 현재 위치를 쓸 수 없습니다.");
      return;
    }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void save({
          label: "지금 있는 곳",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setSaving(false);
        setError("위치를 허용하면 지금 있는 곳으로 넣을 수 있어요.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  };

  const pickSearched = (place: FoundPlace) => {
    setSearched(place);
    void save({ label: place.name, lat: place.lat, lng: place.lng });
  };

  const saveSearchedAsMyPlace = () => {
    if (!searched) return;
    addMyPlace({
      label: searched.name.slice(0, 12),
      address: searched.address,
      lat: searched.lat,
      lng: searched.lng,
    });
    setPlaces(listMyPlaces());
    setSearched(null);
  };

  const deletePlace = (id: string) => {
    removeMyPlace(id);
    setPlaces(listMyPlaces());
  };

  // 명단 — participantIds 기준. 이름은 member 문서를 우선한다.
  const ids = promiseData.participantIds ?? [];
  const names = promiseData.participantNames ?? [];
  const myKey = normalizeKakaoId(myUid);

  const roster = ids.map((uid, i) => {
    const key = normalizeKakaoId(uid) ?? uid;
    const m = members[key] ?? null;
    // origin 필드가 생기기 전 문서는 경로 안에만 출발지가 있다.
    const origin = m?.origin ?? m?.route?.origin ?? null;
    return {
      key: uid,
      name: m?.name || names[i] || "참여자",
      originLabel: origin?.label ?? null,
      isMe: !!myKey && key === myKey,
    };
  });

  const decided = roster.filter((r) => r.originLabel).length;
  const mine = roster.find((r) => r.isMe);
  const myOrigin = justSaved ?? mine?.originLabel ?? null;

  return (
    <section className="mb-3 rounded-2xl bg-[var(--tk-paper)] p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--ap-honey-weak)]">
          <MapPin className="size-4 text-[var(--ap-honey)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="tk-title">어디서 출발하세요?</p>
          <p className="tk-note mt-1 text-[var(--tk-sub)]">
            지금 안 정해도 괜찮아요. 대신 정해두면 다 같이 편한 장소를 맞출 때{" "}
            <b className="text-[var(--tk-ink)]">내 시간도 같이 계산</b>돼요.
          </p>
        </div>
      </div>

      {myOrigin ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--ap-leaf)]/10 px-3.5 py-3">
          <Check className="size-4 shrink-0 text-[var(--ap-leaf)]" />
          <span className="tk-meta min-w-0 flex-1 truncate font-bold text-[var(--ap-leaf)]">
            {myOrigin}에서 출발
          </span>
          {saving && <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--ap-leaf)]" />}
        </div>
      ) : null}

      <div className="mt-3">
        <OriginSearch onPick={pickSearched} placeholder="출발지 검색" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={useCurrentPosition}
          disabled={saving}
          className="tk-caption flex items-center gap-1 rounded-full bg-[var(--tk-ink)] px-3 py-2
            font-bold text-[var(--tk-paper)] transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Crosshair className="size-3.5" />}
          지금 있는 곳
        </button>

        {places.map((p) => (
          <span key={p.id} className="relative">
            <button
              type="button"
              onClick={() => void save({ label: p.label, lat: p.lat, lng: p.lng })}
              disabled={saving}
              title={p.address}
              className="tk-caption rounded-full bg-[var(--tk-ground)] py-2 pl-3 pr-7
                text-[var(--tk-ink)] transition hover:brightness-95 disabled:opacity-60"
            >
              {p.label}
            </button>
            <button
              type="button"
              onClick={() => deletePlace(p.id)}
              aria-label={`${p.label} 지우기`}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1
                text-[var(--tk-faint)] transition hover:bg-black/10"
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}

        {searched && (
          <button
            type="button"
            onClick={saveSearchedAsMyPlace}
            className="tk-caption flex items-center gap-1 rounded-full border border-dashed
              border-[var(--tk-line)] px-3 py-2 text-[var(--tk-sub)] transition
              hover:bg-[var(--tk-ground)]"
          >
            <Bookmark className="size-3.5" />
            자주 쓰는 곳으로 저장
          </button>
        )}
      </div>

      {error && <p className="tk-caption mt-2 text-[var(--tk-warn)]">{error}</p>}

      {/* 누가 정했는지 — "두 명 더 넣으면 비교가 정확해진다"가 보이게 */}
      {!blocked && roster.length > 0 && (
        <div className="mt-4 border-t border-dashed border-[var(--tk-line)] pt-3.5">
          <p className="mb-2.5 tk-label text-[var(--tk-faint)]">출발지를 정한 사람</p>

          <div className="mb-3 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--tk-ground)]">
              <span
                className="block h-full rounded-full bg-[var(--ap-leaf)] transition-[width]"
                style={{ width: `${Math.round((decided / roster.length) * 100)}%` }}
              />
            </span>
            <span className="tk-caption shrink-0 font-bold tabular-nums text-[var(--tk-sub)]">
              {decided} / {roster.length}
            </span>
          </div>

          <ul className="space-y-2">
            {roster.map((r) => (
              <li
                key={r.key}
                className={`flex items-center gap-2.5 ${r.originLabel ? "" : "opacity-55"}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--tk-ground)] text-[11px] font-bold">
                  {r.name.trim().charAt(0) || "?"}
                </span>
                <span className="tk-meta min-w-0 flex-1 truncate font-medium">
                  {r.name}
                  {r.isMe && <span className="tk-caption text-[var(--tk-faint)]"> 나</span>}
                </span>
                <span
                  className={`tk-caption shrink-0 truncate ${
                    r.originLabel ? "text-[var(--tk-faint)]" : "text-[var(--tk-assistive)]"
                  }`}
                >
                  {r.originLabel ?? "아직 안 정함"}
                </span>
              </li>
            ))}
          </ul>

          <p className="tk-caption mt-3 text-[var(--tk-assistive)]">
            정한 사람이 많을수록 장소 비교가 정확해져요. 안 정한 사람은 계산에서 빠집니다.
          </p>
        </div>
      )}
    </section>
  );
}
