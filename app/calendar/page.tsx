"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { CalendarDays, Loader2 } from "lucide-react";

import { db } from "@/lib/firebase";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import CalendarDay from "@/components/calendar-day";
import CalendarMonth from "@/components/calendar-month";
import TabBar from "@/components/tab-bar";
import Wordmark from "@/components/wordmark";
import { addNote as apiAddNote, fetchNotes, removeNote as apiRemoveNote } from "@/lib/api-client";
import {
  groupNotesByDate,
  groupPlansByDate,
  monthGrid,
  shiftMonth,
  todayKey,
  undatedPlans,
} from "@/lib/calendar";
import { displayWhere } from "@/lib/meeting-mode";
import { toCanonicalUid } from "@/lib/uid";
import type { CalendarNote, PromiseData, PromiseMember } from "@/lib/types";

// 개인 달력.
//
// **새 데이터 파이프라인이 아니라 같은 데이터의 다른 화면이다.** 대시보드가
// 이미 participantIds로 내 플랜을 전부 읽고 있어서, 달력은 그걸 날짜별로
// 묶기만 한다. 그래서 "한 명이 플랜을 만들면 참여자 모두의 달력에 들어간다"가
// 따로 만들 것 없이 그냥 된다.
//
// 날짜 범위 질의를 쓰지 않는 이유: PromiseData.date가 string | Timestamp라
// 타입이 섞여 있고, Firestore는 타입별로 먼저 정렬해서 **문자열 범위 질의가
// Timestamp 문서를 통째로 놓친다.** 지금은 한 사람당 수십 건이라 전부 읽어
// 여기서 묶는 편이 맞다(색인도 마이그레이션도 필요 없다).

export default function CalendarPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { ready: firebaseReady } = useFirebaseAuth();
  const currentUserId = session?.user?.id;

  const [plans, setPlans] = useState<PromiseData[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [leaveAtByPlan, setLeaveAtByPlan] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [ym, setYm] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));
  const [selected, setSelected] = useState<string>(() => todayKey(now));

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [status, session, router]);

  // 내 플랜 — 대시보드와 같은 질의.
  useEffect(() => {
    if (!firebaseReady || !currentUserId) {
      setPlans([]);
      return;
    }
    const q = query(
      collection(db, "promises"),
      where("participantIds", "array-contains", currentUserId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PromiseData) })));
        setLoadError(null);
        setLoading(false);
      },
      (err) => {
        console.error("달력 플랜 구독 실패:", err);
        setLoadError("플랜을 불러오지 못했습니다.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [firebaseReady, currentUserId]);

  // 메모 — 이것만 읽기도 서버를 거친다(users/ 보안 규칙을 새로 안 만들려고).
  const reloadNotes = useCallback(async () => {
    try {
      const { notes } = await fetchNotes();
      setNotes(notes);
    } catch (err) {
      console.warn("메모를 불러오지 못함:", err);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void reloadNotes();
  }, [status, reloadNotes]);

  // 각 플랜에서 내 출발 시각. 이 화면의 핵심 값이라 따로 읽는다.
  //
  // 플랜마다 한 번씩 읽는다. collectionGroup으로 한 번에 가져오는 방법도 있지만
  // 그건 색인과 규칙을 새로 배포해야 해서(사람이 직접 해야 하는 일) 지금 규모
  // (한 사람당 수십 건)에서는 개별로 읽는 편이 싸다.
  useEffect(() => {
    const uid = toCanonicalUid(currentUserId);
    if (!firebaseReady || !uid || plans.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        plans.map(async (p) => {
          if (!p.id) return null;
          try {
            const snap = await getDoc(doc(db, "promises", p.id, "members", uid));
            const m = snap.exists() ? (snap.data() as PromiseMember) : null;
            return [p.id, m?.leaveAt ?? null] as const;
          } catch {
            // 규칙 배포 전이거나 문서가 없을 때. 출발 시각만 안 보이면 된다.
            return [p.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      setLeaveAtByPlan(Object.fromEntries(entries.filter(Boolean) as [string, string | null][]));
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseReady, currentUserId, plans]);

  const plansByDate = useMemo(() => groupPlansByDate(plans), [plans]);
  const notesByDate = useMemo(() => groupNotesByDate(notes), [notes]);
  const undated = useMemo(() => undatedPlans(plans), [plans]);
  const cells = useMemo(() => monthGrid(ym.year, ym.month, now), [ym, now]);

  const planDays = useMemo(() => new Set(Object.keys(plansByDate)), [plansByDate]);
  const noteDays = useMemo(() => new Set(Object.keys(notesByDate)), [notesByDate]);

  const handleAddNote = async (text: string) => {
    const { note } = await apiAddNote(selected, text);
    setNotes((prev) => [note, ...prev]);
  };

  const handleRemoveNote = async (id: string) => {
    await apiRemoveNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const jumpToToday = () => {
    setYm({ year: now.getFullYear(), month: now.getMonth() + 1 });
    setSelected(todayKey(now));
  };

  if (status === "loading" || (loading && plans.length === 0 && !loadError)) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--tk-ground)]">
        <Loader2 className="size-6 animate-spin text-[var(--tk-faint)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tk-ground)]">
      <div className="container mx-auto max-w-lg px-4 pb-24 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <Wordmark size="md" />
          <span className="tk-caption flex items-center gap-1.5 text-[var(--tk-faint)]">
            <CalendarDays className="size-3.5" />
            달력
          </span>
        </div>

        {loadError && (
          <p className="tk-caption mb-3 rounded-xl bg-[var(--ap-red-weak)] px-3 py-2.5 text-[var(--ap-red)]">
            {loadError}
          </p>
        )}

        <CalendarMonth
          year={ym.year}
          month={ym.month}
          cells={cells}
          planDays={planDays}
          noteDays={noteDays}
          selected={selected}
          onSelect={setSelected}
          onShift={(by) => setYm((cur) => shiftMonth(cur.year, cur.month, by))}
          onToday={jumpToToday}
        />

        <CalendarDay
          dayKey={selected}
          plans={plansByDate[selected] ?? []}
          leaveAtByPlan={leaveAtByPlan}
          notes={notesByDate[selected] ?? []}
          onAddNote={handleAddNote}
          onRemoveNote={handleRemoveNote}
        />

        {/* 날짜를 아직 안 정한 플랜은 달력 어디에도 자리가 없다. 그렇다고 안
            보여주면 만들어놓고 잊어버린다 — 아래에 따로 모은다. */}
        {undated.length > 0 && (
          <section className="mt-5">
            <p className="mb-2 px-1 tk-label text-[var(--tk-faint)]">날짜 정하는 중 {undated.length}</p>
            {undated.map((p) => (
              <Link
                key={p.id}
                href={`/promise/${p.id}`}
                className="mb-1.5 flex items-center gap-2.5 rounded-2xl bg-[var(--tk-paper)] px-3.5 py-3
                  shadow-sm ring-1 ring-black/5 transition hover:brightness-[0.98]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--ap-red)]/45" />
                <span className="min-w-0 flex-1">
                  <span className="tk-meta block truncate font-medium text-[var(--tk-ink)]">
                    {p.title}
                  </span>
                  <span className="tk-caption block truncate text-[var(--tk-faint)]">
                    {displayWhere(p)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <TabBar />
    </div>
  );
}
