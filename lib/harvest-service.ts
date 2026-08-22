import { admin, db } from "@/lib/firebaseAdmin";
import { badRequest, forbidden, type Caller } from "@/lib/api-guard";
import { BRIX_START, clampBrix } from "@/lib/brix";
import {
  canHarvest,
  harvestClosesAt,
  harvestOpensAt,
  harvestSubjects,
  harvestWindow,
  settleHarvest,
  shouldSettle,
  type HarvestSubject,
  type HarvestWindow,
} from "@/lib/harvest";
import { MEMBERS, promiseRef, requireParticipant } from "@/lib/promise-service";
import { toCanonicalUid } from "@/lib/uid";
import type {
  HarvestBallot,
  HarvestSettlement,
  HarvestResult,
  HarvestVote,
  PoisonApple,
  PromiseData,
  UserApple,
} from "@/lib/types";

// 수확 — 표를 받고, 때가 되면 정산해서 당도에 반영한다.
//
// **표는 promises/{id}/harvest/{uid}에 있고 클라이언트는 못 읽는다.**
// 보안 규칙 맨 아래 `match /{document=**} { allow read, write: if false }`가
// 열어주지 않은 경로를 전부 막기 때문에, 새 규칙을 배포하지 않아도 이미
// 차단되어 있다. 이게 "전원이 낼 때까지 서로 못 본다"의 실제 근거다 —
// 화면에서 안 보여주는 게 아니라 데이터에 닿을 수가 없다.
//
// 정산이 끝나면 **집계만** 약속 문서로 올라간다. 누가 누구를 찍었는지는
// 끝까지 어디에도 노출되지 않는다.

const FieldValue = admin.firestore.FieldValue;

const HARVEST = "harvest";

function ballotsRef(promiseId: string) {
  return promiseRef(promiseId).collection(HARVEST);
}

/** uid의 ':'는 문서 ID에 쓸 수 있다(금지 문자는 '/' 뿐). members/와 같은 방식. */
function ballotRef(promiseId: string, uid: string) {
  return ballotsRef(promiseId).doc(uid);
}

function userRef(uid: string) {
  return db.collection("users").doc(uid);
}

/**
 * 내 사과 — 당도와 독사과.
 *
 * users/{uid}는 클라이언트가 못 읽는다(규칙 기본 차단). 메모와 같은 이유로
 * **읽기도 서버를 거치게** 두고 `users/` 규칙을 새로 배포하지 않는다.
 * 실시간이어야 할 값도 아니다 — 수확이 끝날 때만 바뀐다.
 *
 * 문서가 없으면 시작값을 돌려준다. 가입할 때 미리 만들어두지 않는 이유는,
 * 그러면 로그인 흐름에 쓰기가 하나 끼어드는데 아직 수확을 한 번도 안 한
 * 사람에게는 저장할 것이 없기 때문이다.
 */
export async function getMyApple(caller: Caller): Promise<UserApple> {
  const snap = await userRef(toCanonicalUid(caller.uid)!).get();
  const v = snap.data();

  return {
    brix: typeof v?.brix === "number" ? clampBrix(v.brix) : BRIX_START,
    poisonApples: Array.isArray(v?.poisonApples) ? (v!.poisonApples as PoisonApple[]) : [],
    harvested: typeof v?.harvested === "number" ? v.harvested : 0,
    updatedAt: typeof v?.updatedAt === "string" ? v.updatedAt : undefined,
  };
}

/** 화면 하나를 그리는 데 필요한 전부. */
export interface HarvestState {
  /** 이 응답을 받는 사람. 화면이 평가 목록에서 자기를 빼는 데 쓴다. */
  meUid: string;
  window: HarvestWindow;
  opensAt: string | null;
  closesAt: string | null;
  /** 평가 대상이자 평가자. 미리 "못 가요" 한 사람은 빠져 있다. */
  subjects: HarvestSubject[];
  /** 내가 표를 냈는가 */
  submitted: boolean;
  /** 내가 평가할 수 있는 사람인가 (못 간다고 한 사람은 남을 평가하지 않는다) */
  eligible: boolean;
  votedCount: number;
  eligibleCount: number;
  settlement: HarvestSettlement | null;
  /** 정산 뒤 나에 대한 결과 */
  mine: HarvestResult | null;
}

/**
 * 이번 플랜의 평가 대상.
 *
 * 참여자 명단(약속 문서)을 기준으로 삼고 이름·참석 여부만 member 문서에서
 * 덮어쓴다. member 문서는 뭔가를 한 사람만 생기기 때문에, 그것만 보면
 * 아무것도 안 누르고 그냥 온 사람이 통째로 빠진다.
 */
async function subjectsOf(promiseId: string, data: FirebaseFirestore.DocumentData) {
  const ids: string[] = Array.isArray(data.participantIds) ? data.participantIds : [];
  const names: string[] = Array.isArray(data.participantNames) ? data.participantNames : [];

  const snap = await promiseRef(promiseId).collection(MEMBERS).get();
  const byUid = new Map(snap.docs.map((d) => [d.id, d.data()]));

  return harvestSubjects(
    ids.map((uid, i) => {
      const m = byUid.get(uid);
      return {
        uid,
        name: String(m?.name ?? names[i] ?? "").trim() || "이름 없음",
        attendance: (m?.attendance as string | undefined) ?? null,
      };
    })
  );
}

/**
 * 정산. **트랜잭션 안에서 딱 한 번만 일어나야 한다.**
 *
 * 자동으로 도는 작업이 없어서 누군가 화면을 열 때 이 함수가 불린다. 그 말은
 * 세 사람이 동시에 열면 세 번 불린다는 뜻이고, 그대로 두면 당도가 세 번
 * 깎인다. 그래서 약속 문서의 harvest 필드를 트랜잭션 안에서 먼저 확인하고,
 * 이미 있으면 그걸 그대로 돌려준다.
 *
 * 정산할 때가 아니면 null. 부른 쪽은 그냥 진행 상황만 보여주면 된다.
 */
async function settleIfDue(
  promiseId: string,
  promise: PromiseData,
  subjects: HarvestSubject[],
  now: Date
): Promise<HarvestSettlement | null> {
  if (!canHarvest(subjects)) return null;

  return db.runTransaction(async (tx) => {
    const pRef = promiseRef(promiseId);

    // --- 읽기는 전부 먼저. 트랜잭션에서 쓰기 뒤의 읽기는 금지다. ---
    const pSnap = await tx.get(pRef);
    const existing = pSnap.data()?.harvest as HarvestSettlement | undefined;
    if (existing) return existing;

    const ballotSnap = await tx.get(ballotsRef(promiseId));
    const ballots = ballotSnap.docs.map((d) => d.data() as HarvestBallot);

    const win = harvestWindow(promise, now);
    if (!shouldSettle(ballots.length, subjects.length, win)) return null;

    const results = settleHarvest(
      ballots.map((b) => ({ voterUid: b.voterUid, votes: b.votes ?? {} })),
      subjects
    );

    const userSnaps = await Promise.all(results.map((r) => tx.get(userRef(r.uid))));

    // --- 여기부터 쓰기 ---
    const settlement: HarvestSettlement = {
      settledAt: now.toISOString(),
      results,
      voted: ballots.length,
      eligible: subjects.length,
    };

    tx.set(pRef, { harvest: settlement, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    results.forEach((r, i) => {
      const cur = userSnaps[i].data();
      const before = typeof cur?.brix === "number" ? cur.brix : BRIX_START;
      const poisons: PoisonApple[] = Array.isArray(cur?.poisonApples) ? cur!.poisonApples : [];

      const next: Record<string, unknown> = {
        brix: clampBrix(Math.round((before + r.delta) * 10) / 10),
        harvested: (typeof cur?.harvested === "number" ? cur.harvested : 0) + 1,
        updatedAt: now.toISOString(),
      };

      if (r.poison) {
        next.poisonApples = [
          ...poisons,
          {
            promiseId,
            // 플랜이 지워져도 "어디서 받았는지"는 남아야 한다.
            title: String(promise.title ?? "").trim() || "이름 없는 플랜",
            at: now.toISOString(),
          },
        ];
      }

      tx.set(userRef(r.uid), next, { merge: true });
    });

    return settlement;
  });
}

/** 지금 이 플랜의 수확 상태. 정산할 때가 됐으면 여기서 정산까지 한다. */
export async function getHarvestState(
  caller: Caller,
  promiseId: string,
  now: Date = new Date()
): Promise<HarvestState> {
  const data = await requireParticipant(promiseId, caller);
  const promise = data as PromiseData;

  const subjects = await subjectsOf(promiseId, data);
  const win = harvestWindow(promise, now);

  let settlement = (data.harvest as HarvestSettlement | undefined) ?? null;
  if (!settlement && (win === "open" || win === "closed")) {
    settlement = await settleIfDue(promiseId, promise, subjects, now);
  }

  const ballotSnap = await ballotsRef(promiseId).get();
  const me = toCanonicalUid(caller.uid)!;

  return {
    meUid: me,
    window: win,
    opensAt: harvestOpensAt(promise)?.toISOString() ?? null,
    closesAt: harvestClosesAt(promise)?.toISOString() ?? null,
    subjects,
    submitted: ballotSnap.docs.some((d) => d.id === me),
    eligible: subjects.some((s) => s.uid === me),
    votedCount: ballotSnap.size,
    eligibleCount: subjects.length,
    settlement,
    mine: settlement?.results.find((r) => r.uid === me) ?? null,
  };
}

const VOTES: HarvestVote[] = ["onTime", "late", "noShow"];

/**
 * 표를 낸다.
 *
 * 한 번 내면 못 바꾼다. 바꿀 수 있게 하면 남이 낸 것을 보고 맞추게 되는데,
 * 그러면 서로 눈치를 보느라 아무도 사실대로 안 찍는다. 다만 정산 전에는
 * 진행 상황("3명 중 2명")만 보이고 내용은 아무에게도 안 보인다.
 */
export async function submitHarvestBallot(
  caller: Caller,
  promiseId: string,
  votes: Record<string, HarvestVote>,
  now: Date = new Date()
): Promise<HarvestState> {
  const data = await requireParticipant(promiseId, caller);
  const promise = data as PromiseData;
  const me = toCanonicalUid(caller.uid)!;

  const win = harvestWindow(promise, now);
  if (win === "none") throw badRequest("날짜가 정해지지 않아 아직 수확할 수 없어요.");
  if (win === "waiting") throw badRequest("약속이 끝난 뒤에 열려요.");
  if (win === "closed") throw badRequest("수확 기간이 지났어요.");

  if (data.harvest) throw badRequest("이미 정산이 끝났어요.");

  const subjects = await subjectsOf(promiseId, data);
  if (!canHarvest(subjects)) throw badRequest("평가할 사람이 없어요.");
  if (!subjects.some((s) => s.uid === me)) {
    // 못 간다고 한 사람은 그날을 못 봤다. 안 본 것을 평가하게 두면 안 된다.
    throw forbidden("못 간다고 하신 플랜은 평가할 수 없어요.");
  }

  const existing = await ballotRef(promiseId, me).get();
  if (existing.exists) throw badRequest("이미 표를 내셨어요.");

  // 대상이 아닌 uid나 모르는 값이 섞여 들어오면 통째로 막는다. 조용히 버리면
  // 화면에서 고른 것과 저장된 것이 달라지는데, 그건 나중에 찾기 아주 나쁘다.
  const clean: Record<string, HarvestVote> = {};
  for (const [uid, v] of Object.entries(votes ?? {})) {
    if (uid === me) continue; // 자기 표는 조용히 버린다 — 세지도 않으므로 해가 없다
    if (!subjects.some((s) => s.uid === uid)) throw badRequest("평가 대상이 아닌 사람이 있어요.");
    if (!VOTES.includes(v)) throw badRequest("알 수 없는 평가 값이에요.");
    clean[uid] = v;
  }

  const missing = subjects.filter((s) => s.uid !== me && !(s.uid in clean));
  if (missing.length > 0) throw badRequest(`${missing[0].name}님을 아직 안 고르셨어요.`);

  const ballot: HarvestBallot = {
    voterUid: me,
    voterName: caller.name?.trim() || "이름 없음",
    votes: clean,
    submittedAt: now.toISOString(),
  };
  await ballotRef(promiseId, me).set(ballot);
  // 홈 목록이 배지를 달 수 있도록 "냈다"는 사실만 약속 문서에 남긴다.
  await promiseRef(promiseId).set(
    { harvestVoters: FieldValue.arrayUnion(me) },
    { merge: true }
  );

  return getHarvestState(caller, promiseId, now);
}
