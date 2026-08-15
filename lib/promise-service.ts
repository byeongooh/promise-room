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
}

// ---------------------------------------------------------------- 삭제

export async function deletePromise(caller: Caller, promiseId: string): Promise<void> {
  const ref = promiseRef(promiseId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("약속을 찾을 수 없습니다.");

  if (!isCreatorOf(snap.data()!, caller)) {
    throw forbidden("이 약속은 만든 사람만 삭제할 수 있습니다.");
  }

  // Firestore는 하위 컬렉션을 자동으로 지우지 않는다. 해시/시도기록이 남지 않게 같이 지운다.
  const privateDocs = await ref.collection(PRIVATE).listDocuments();
  const batch = db.batch();
  privateDocs.forEach((d) => batch.delete(d));
  batch.delete(ref);
  await batch.commit();
}
