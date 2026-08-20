"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { normalizeKakaoId } from "@/lib/promise-permissions";
import type { PromiseMember } from "@/lib/types";

// promises/{id}/members 실시간 구독.
//
// 원래 member-board 안에만 있던 것을 빼냈다. 방장의 확정 바도 같은 데이터가
// 필요한데(누가 "이 장소는 어렵다"고 했는지 봐야 되돌릴지 정할 수 있다),
// 두 곳에서 각자 구독하면 언젠가 두 화면이 다른 말을 한다.
//
// 같은 컬렉션을 두 컴포넌트가 이 훅으로 구독해도 Firestore SDK가 같은 질의를
// 하나의 watch 스트림으로 묶으므로 네트워크가 두 배가 되지는 않는다.

export interface PromiseMembers {
  /** normalizeKakaoId를 통과한 uid → 문서. uid 형식이 두 가지라 반드시 정규화한다. */
  byUid: Record<string, PromiseMember>;
  /** 보안 규칙을 아직 배포하지 않아 못 읽는 상태. 그때만 true. */
  blocked: boolean;
  /** 첫 응답이 오기 전인지. 없는 것과 아직 안 온 것을 구분해야 할 때 쓴다. */
  loading: boolean;
}

export function usePromiseMembers(promiseId: string): PromiseMembers {
  const [byUid, setByUid] = useState<Record<string, PromiseMember>>({});
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!promiseId) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    // 구독을 한 박자 늦게 건다.
    //
    // React StrictMode는 개발 중 effect를 붙였다 떼고 다시 붙인다. 그걸 그대로
    // 두면 Firestore가 같은 감시 대상을 순식간에 추가·삭제하면서 내부 단언에
    // 걸려 터진다("INTERNAL ASSERTION FAILED ... ca9"). 한 프레임 미루면
    // 첫 번째 왕복은 구독을 만들기 전에 취소되므로 리스너가 하나만 남는다.
    const timer = setTimeout(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        collection(db, "promises", promiseId, "members"),
        (snap) => {
          setBlocked(false);
          setLoading(false);
          const next: Record<string, PromiseMember> = {};
          snap.forEach((d) => {
            next[normalizeKakaoId(d.id) ?? d.id] = { ...(d.data() as PromiseMember), uid: d.id };
          });
          setByUid(next);
        },
        (err) => {
          // 규칙 배포 전에는 여기로 온다. 화면 전체를 깨뜨리지 않고 조용히 접는다.
          console.warn("[members] 참여자 상태를 읽지 못함:", err.code);
          setBlocked(true);
          setLoading(false);
        }
      );
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, [promiseId]);

  return { byUid, blocked, loading };
}
