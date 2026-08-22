"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { BRIX_START, POISON_DAYS } from "@/lib/brix";
import { fetchMyApple } from "@/lib/api-client";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import { getPromiseDate } from "@/lib/promise-time";
import type { PromiseData, UserApple } from "@/lib/types";

// 내 사과에 필요한 숫자들.
//
// 두 곳에서 읽는다. **당도와 독사과는 서버에서**(users/{uid}는 보안 규칙이
// 클라이언트에 안 열어준다), **함께한 플랜·사람 수는 Firestore에서 직접**.
// 뒤엣것은 이미 구독 중인 약속 목록으로 세는 것이라 따로 부를 이유가 없다.
//
// 당도는 수확이 끝날 때만 바뀌므로 실시간 구독이 아니라 한 번 읽고 만다.
// 수확을 한 번도 안 한 사람은 문서 자체가 없고, 그때는 시작값이 온다 —
// 그건 "아직 기록이 없다"는 뜻이라 화면에서 그렇게 말해준다.

export interface AppleStats {
  /** 평판 점수. 수확이 끝날 때마다 서버가 다시 계산해 저장한 값이다. */
  brix: number;
  /** 아직 수확을 한 번도 안 해서 시작값 그대로인지 */
  brixIsPlaceholder: boolean;
  /** 수확을 마친 플랜 수 */
  harvested: number;
  /** 지금까지 참여한 플랜 수 */
  planCount: number;
  /** 그중 이미 지난 것 — 실제로 만난 횟수 */
  pastCount: number;
  /** 함께한 사람 수 (나 제외, 중복 없이) */
  partnerCount: number;
  /** 최근 독사과. POISON_DAYS(90일)가 안 지난 것만 */
  poison: { promiseId: string; title: string; expiresAt: string }[];
  loading: boolean;
  error: string | null;
}

export function useAppleStats(uid: string | undefined, ready: boolean): AppleStats {
  const [promises, setPromises] = useState<PromiseData[] | null>(null);
  const [apple, setApple] = useState<UserApple | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 당도·독사과 — 서버를 거쳐 읽는다.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { apple } = await fetchMyApple();
        if (!cancelled) setApple(apple);
      } catch {
        // 못 읽으면 시작값으로 그린다. 여기서 화면을 막을 이유는 없다.
        if (!cancelled) setApple({ brix: BRIX_START, poisonApples: [], harvested: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!ready || !uid) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // StrictMode가 붙였다 떼는 왕복에서 Firestore 감시 스트림이 터지는 걸
    // 피하려고 한 프레임 미룬다 (member-board와 같은 이유).
    const timer = setTimeout(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        query(collection(db, "promises"), where("participantIds", "array-contains", uid)),
        (snap) => {
          setPromises(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PromiseData) })));
          setError(null);
        },
        (err) => {
          console.warn("[apple-stats] 플랜을 읽지 못함:", err.code);
          setError("기록을 불러오지 못했습니다.");
          setPromises([]);
        }
      );
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [uid, ready]);

  return useMemo(() => {
    const mine = normalizeKakaoId(uid);
    const list = promises ?? [];
    const now = new Date();

    const partners = new Set<string>();
    let pastCount = 0;

    for (const p of list) {
      for (const id of p.participantIds ?? []) {
        const k = normalizeKakaoId(id);
        if (k && k !== mine) partners.add(k);
      }
      const when = getPromiseDate(p);
      if (when && when.getTime() < now.getTime()) pastCount++;
    }

    // 90일이 지난 독사과는 "최근"이 아니다. 당도에서 깎인 것은 그대로 남지만
    // (poisonPenalty 주석 참고), 화면의 경고는 사라진다.
    const recent = (apple?.poisonApples ?? [])
      .map((p) => ({
        promiseId: p.promiseId,
        title: p.title,
        expiresAt: new Date(new Date(p.at).getTime() + POISON_DAYS * 86_400_000).toISOString(),
      }))
      .filter((p) => new Date(p.expiresAt).getTime() > now.getTime());

    return {
      brix: apple?.brix ?? BRIX_START,
      brixIsPlaceholder: (apple?.harvested ?? 0) === 0,
      harvested: apple?.harvested ?? 0,
      planCount: list.length,
      pastCount,
      partnerCount: partners.size,
      poison: recent,
      loading: (promises === null || apple === null) && !error,
      error,
    };
  }, [promises, apple, uid, error]);
}
