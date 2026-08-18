"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { BRIX_START } from "@/lib/brix";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import { getPromiseDate } from "@/lib/promise-time";
import type { PromiseData } from "@/lib/types";

// 내 사과에 필요한 숫자들.
//
// 당도와 독사과는 아직 **수확 기능이 없어서 저장되는 곳이 없다.** 그래서
// 지금은 시작값을 그대로 쓰고, 화면에서도 그렇다고 말한다. 없는 값을
// 그럴듯하게 지어내지 않는다(핸드오프 §9).
//
// 반면 함께한 플랜·사람 수는 이미 있는 약속 문서에서 진짜로 셀 수 있다.

export interface AppleStats {
  /** 평판 점수. 수확이 붙기 전까지는 모두 시작값. */
  brix: number;
  /** 수확 기능이 아직 없어 당도가 시작값에 머물러 있는지 */
  brixIsPlaceholder: boolean;
  /** 지금까지 참여한 플랜 수 */
  planCount: number;
  /** 그중 이미 지난 것 — 실제로 만난 횟수 */
  pastCount: number;
  /** 함께한 사람 수 (나 제외, 중복 없이) */
  partnerCount: number;
  /** 독사과. 수확이 붙기 전까지 항상 빈 배열 */
  poison: { promiseId: string; expiresAt: string }[];
  loading: boolean;
  error: string | null;
}

export function useAppleStats(uid: string | undefined, ready: boolean): AppleStats {
  const [promises, setPromises] = useState<PromiseData[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    return {
      brix: BRIX_START,
      brixIsPlaceholder: true,
      planCount: list.length,
      pastCount,
      partnerCount: partners.size,
      poison: [],
      loading: promises === null && !error,
      error,
    };
  }, [promises, uid, error]);
}
