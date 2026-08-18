import { admin, db } from "@/lib/firebaseAdmin";
import { hashPassword, isHashed, verifyPassword } from "@/lib/password";
import { isCanonicalUid, isSameUser, toCanonicalUid } from "@/lib/uid";
import { badRequest, forbidden, notFound, type Caller, ApiError } from "@/lib/api-guard";

// 약속에 대한 모든 쓰기는 이 파일을 통해서만 이뤄진다.
// Admin SDK는 보안 규칙을 우회하므로, 권한 검사는 전적으로 여기 로직이 책임진다.

const FieldValue = admin.firestore.FieldValue;

const COLLECTION = "promises";
const PRIVATE = "private";
const AUTH_DOC = "auth";
const MEMBERS = "members";

// 비밀번호 시도 제한: 10분 안에 10회
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

function promiseRef(promiseId: string) {
  return db.collection(COLLECTION).doc(promiseId);
}

function authRef(promiseId: string) {
  return promiseRef(promiseId).collection(PRIVATE).doc(AUTH_DOC);
}

/** uid에 ':' 가 들어있어 문서 ID로 쓰기 위해 치환한다. */
function attemptsRef(promiseId: string, uid: string) {
  return promiseRef(promiseId).collection(PRIVATE).doc(`attempts_${uid.replace(/[:/]/g, "_")}`);
}

/**
 * 참여자 상태 문서. 문서 ID를 uid 그대로 쓴다 — Firestore 문서 ID에서 금지된
 * 문자는 '/' 뿐이라 "kakao:123"은 그대로 쓸 수 있고, 그래야 화면에서
 * 목록을 뒤지지 않고 곧바로 내 문서를 집을 수 있다.
 */
function memberRef(promiseId: string, uid: string) {
  return promiseRef(promiseId).collection(MEMBERS).doc(uid);
}

export interface CreatePromiseInput {
  title: string;
  date: string;
  time: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string | null;
  penalty: string;
  password: string;
}

export interface PromiseSummary {
  id: string;
  title: string;
  creatorName: string | null;
  alreadyParticipant: boolean;
}

/** 해당 문서에서 이 사용자가 작성자인지 (v2 ID 우선, 레거시 이름 폴백). */
function isCreatorOf(data: FirebaseFirestore.DocumentData, caller: Caller): boolean {
  if (data.creatorId) return isSameUser(data.creatorId as string, caller.uid);
  return !!caller.name && data.creator === caller.name;
}

/** 해당 문서에 이 사용자가 참여 중인지 (v2 ID 우선, 레거시 이름 폴백). */
function isParticipantOf(data: FirebaseFirestore.DocumentData, caller: Caller): boolean {
  const ids = (data.participantIds ?? []) as string[];
  if (ids.length > 0 && ids.some((id) => isSameUser(id, caller.uid))) return true;
  const names = (data.participants ?? []) as string[];
  return !!caller.name && names.includes(caller.name);
}

// ---------------------------------------------------------------- 생성

export async function createPromise(caller: Caller, input: CreatePromiseInput): Promise<string> {
  if (!isCanonicalUid(caller.uid)) {
    throw badRequest("사용자 ID 형식이 올바르지 않습니다. 다시 로그인해주세요.");
  }

  const displayName = caller.name?.trim() || "이름 없음";
  const ref = promiseRef(db.collection(COLLECTION).doc().id);

  const hash = await hashPassword(input.password);

  const batch = db.batch();
  batch.set(ref, {
    title: input.title,
    date: input.date,
    time: input.time,
    location: input.location,
    locationLat: input.locationLat ?? null,
    locationLng: input.locationLng ?? null,
    locationPlaceId: input.locationPlaceId ?? null,
    penalty: input.penalty,
    status: "active",

    creatorId: caller.uid,
    creatorName: displayName,
    participantIds: [caller.uid],
    participantNames: [displayName],

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(authRef(ref.id), {
    algo: "scrypt",
    hash,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return ref.id;
}

// ---------------------------------------------------------------- 요약(참여 화면용)

/**
 * 참여자가 아닌 사람에게 보여줄 최소 정보.
 * 날짜/장소/참여자/비밀번호는 절대 포함하지 않는다.
 */
export async function getPromiseSummary(
  promiseId: string,
  caller: Caller
): Promise<PromiseSummary> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");
  const data = snap.data()!;

  return {
    id: snap.id,
    title: (data.title as string) ?? "",
    creatorName: (data.creatorName as string) ?? (data.creator as string) ?? null,
    alreadyParticipant: isParticipantOf(data, caller) || isCreatorOf(data, caller),
  };
}

// ---------------------------------------------------------------- 참여

async function checkAndBumpAttempts(promiseId: string, uid: string): Promise<void> {
  const ref = attemptsRef(promiseId, uid);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const { count = 0, windowStart = 0 } = snap.data() as {
      count?: number;
      windowStart?: number;
    };
    if (now - windowStart < WINDOW_MS && count >= MAX_ATTEMPTS) {
      const mins = Math.ceil((WINDOW_MS - (now - windowStart)) / 60000);
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        `비밀번호를 너무 많이 틀렸습니다. ${mins}분 후에 다시 시도해주세요.`
      );
    }
    if (now - windowStart >= WINDOW_MS) {
      await ref.set({ count: 0, windowStart: now });
    }
  } else {
    await ref.set({ count: 0, windowStart: now });
  }
}

async function recordFailure(promiseId: string, uid: string): Promise<void> {
  await attemptsRef(promiseId, uid).set(
    { count: FieldValue.increment(1) },
    { merge: true }
  );
}

/**
 * 비밀번호를 확인하고 참여자로 추가한다.
 * 읽기 권한 = 참여 이므로, 비밀번호가 맞으면 곧바로 참여 처리된다.
 */
export async function joinPromise(
  caller: Caller,
  promiseId: string,
  password: string
): Promise<void> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");
  const data = snap.data()!;

  if (isParticipantOf(data, caller)) return; // 이미 참여 중이면 조용히 성공

  await checkAndBumpAttempts(promiseId, caller.uid);

  // 비밀번호는 해시로만 대조한다. 해시가 없는 문서는 참여시키지 않는다
  // (평문 비교 폴백은 마이그레이션 완료와 함께 제거했다).
  const authSnap = await authRef(promiseId).get();
  const storedHash = authSnap.exists ? (authSnap.data()?.hash as string | undefined) : undefined;

  if (!storedHash || !isHashed(storedHash)) {
    console.error(`[promise-service] ${promiseId}: 비밀번호 해시 없음`);
    throw new ApiError(500, "NO_PASSWORD_SET", "이 약속은 비밀번호가 설정되어 있지 않습니다.");
  }

  const ok = await verifyPassword(storedHash, password);

  if (!ok) {
    await recordFailure(promiseId, caller.uid);
    throw forbidden("비밀번호가 올바르지 않습니다.");
  }

  const displayName = caller.name?.trim() || "이름 없음";
  const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    participantIds: FieldValue.arrayUnion(caller.uid),
    participantNames: FieldValue.arrayUnion(displayName),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // 레거시 문서의 작성자가 처음 다시 참여하면 작성자 권한을 회수한다.
  // (이름 신뢰지만 비밀번호를 알아야 하고, 문서당 한 번만 가능하다)
  if (data.legacyClaimable === true && !data.creatorId && caller.name && data.creator === caller.name) {
    updates.creatorId = caller.uid;
    updates.creatorName = caller.name;
    updates.legacyClaimable = FieldValue.delete();
  }

  await promiseRef(promiseId).update(updates);
  await attemptsRef(promiseId, caller.uid).delete().catch(() => {});
}

// ---------------------------------------------------------------- 탈퇴

export async function leavePromise(caller: Caller, promiseId: string): Promise<void> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");
  const data = snap.data()!;

  // 작성자가 나가면 참여자 목록이 비어 아무도 접근 못 하는 유령 문서가 된다.
  if (isCreatorOf(data, caller)) {
    throw forbidden("만든 사람은 나갈 수 없습니다. 약속을 삭제해주세요.");
  }
  if (!isParticipantOf(data, caller)) return; // 이미 빠져 있으면 성공 처리

  const displayName = caller.name?.trim();
  const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  // arrayRemove는 없는 필드를 빈 배열로 만들어버리므로, 실제로 들어있을 때만 건드린다.
  const ids = (data.participantIds ?? []) as string[];
  const match = ids.find((id) => isSameUser(id, caller.uid));
  if (match) updates.participantIds = FieldValue.arrayRemove(match);

  if (displayName) {
    if (((data.participantNames ?? []) as string[]).includes(displayName)) {
      updates.participantNames = FieldValue.arrayRemove(displayName);
    }
    if (((data.participants ?? []) as string[]).includes(displayName)) {
      updates.participants = FieldValue.arrayRemove(displayName);
    }
  }

  await promiseRef(promiseId).update(updates);

  // 나간 사람의 경로·상태가 남아 있으면 참여자 목록에 없는 이름이 현황에 뜬다.
  await memberRef(promiseId, caller.uid).delete().catch(() => {});
}

// ---------------------------------------------------------------- 삭제

export async function deletePromise(caller: Caller, promiseId: string): Promise<void> {
  const ref = promiseRef(promiseId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");

  if (!isCreatorOf(snap.data()!, caller)) {
    throw forbidden("이 약속은 만든 사람만 삭제할 수 있습니다.");
  }

  // Firestore는 하위 컬렉션을 자동으로 지우지 않는다.
  // 해시·시도기록·참여자 상태가 유령으로 남지 않게 같이 지운다.
  const [privateDocs, memberDocs] = await Promise.all([
    ref.collection(PRIVATE).listDocuments(),
    ref.collection(MEMBERS).listDocuments(),
  ]);
  const batch = db.batch();
  privateDocs.forEach((d) => batch.delete(d));
  memberDocs.forEach((d) => batch.delete(d));
  batch.delete(ref);
  await batch.commit();
}

// ---------------------------------------------------------------- 참여자 상태

export type MemberStatus = "unknown" | "onway" | "arrived";

export interface MemberRouteInput {
  kind: "car" | "transit";
  label: string;
  durationSec: number;
  origin: { label: string; lat: number; lng: number };
  mapObj?: string | null;
  transfers?: number | null;
  fare?: number | null;
  firstStation?: string | null;
}

/**
 * 약속 시각을 UTC 기준 Date로 만든다.
 *
 * 문서에는 날짜가 "2026-08-17", 시간이 "19:00" 처럼 한국 현지 시각으로만
 * 들어 있다. 서버(Vercel)는 UTC로 도니까 `new Date(y, m-1, d)`로 만들면
 * 9시간이 밀린다. 그래서 KST(UTC+9)임을 명시해서 만든다.
 */
function promiseInstant(data: FirebaseFirestore.DocumentData): Date | null {
  const raw = data.date;
  let y: number, m: number, d: number;

  if (raw && typeof raw.toDate === "function") {
    // 옛 문서는 date가 Timestamp다. 이미 절대 시각이라 그대로 쓴다.
    const base = raw.toDate() as Date;
    if (Number.isNaN(base.getTime())) return null;
    return base;
  }

  if (typeof raw !== "string") return null;
  [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;

  const [hh, mm] = String(data.time ?? "").split(":").map(Number);
  const instant = new Date(
    Date.UTC(y, m - 1, d, (Number.isFinite(hh) ? hh : 0) - 9, Number.isFinite(mm) ? mm : 0)
  );
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** 참여자가 아니면 던진다. 상태 관련 쓰기는 전부 이걸 먼저 통과한다. */
async function requireParticipant(
  promiseId: string,
  caller: Caller
): Promise<FirebaseFirestore.DocumentData> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");
  const data = snap.data()!;
  if (!isParticipantOf(data, caller) && !isCreatorOf(data, caller)) {
    throw forbidden("이 약속의 참여자가 아닙니다.");
  }
  return data;
}

/**
 * 고른 경로를 저장한다. null이면 지운다(= 아직 안 정한 상태로 되돌린다).
 *
 * 언제 나서야 하는지(leaveAt)를 여기서 같이 계산해 둔다. 알림을 보낼 주체는
 * 결국 서버이고, 그때 가서 경로마다 다시 계산하는 것보다 저장 시점에 한 번
 * 박아두는 편이 낫다. 알림을 몇 분 전에 보낼지는 별개 문제로 남겨둔다.
 */
export async function setMemberRoute(
  caller: Caller,
  promiseId: string,
  route: MemberRouteInput | null
): Promise<{ leaveAt: string | null }> {
  const data = await requireParticipant(promiseId, caller);
  const ref = memberRef(promiseId, caller.uid);

  if (!route) {
    await ref.set(
      {
        uid: caller.uid,
        name: caller.name?.trim() || "이름 없음",
        route: null,
        leaveAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { leaveAt: null };
  }

  const meetAt = promiseInstant(data);
  const leaveAt = meetAt
    ? new Date(meetAt.getTime() - route.durationSec * 1000).toISOString()
    : null;

  await ref.set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      route: {
        kind: route.kind,
        label: route.label,
        durationSec: route.durationSec,
        origin: route.origin,
        mapObj: route.mapObj ?? null,
        transfers: route.transfers ?? null,
        fare: route.fare ?? null,
        firstStation: route.firstStation ?? null,
      },
      leaveAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { leaveAt };
}

/** 확인 안 함 / 가는 중 / 도착. 본인 것만 바꿀 수 있다. */
export async function setMemberStatus(
  caller: Caller,
  promiseId: string,
  status: MemberStatus
): Promise<void> {
  await requireParticipant(promiseId, caller);

  await memberRef(promiseId, caller.uid).set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
