import { admin, db } from "@/lib/firebaseAdmin";
import { hashPassword, isHashed, verifyPassword } from "@/lib/password";
import { isCanonicalUid, isSameUser, toCanonicalUid } from "@/lib/uid";
import { badRequest, forbidden, notFound, type Caller, ApiError } from "@/lib/api-guard";
import { harvestWindow } from "@/lib/harvest";
import type { PromiseData } from "@/lib/types";

// 약속에 대한 모든 쓰기는 이 파일을 통해서만 이뤄진다.
// Admin SDK는 보안 규칙을 우회하므로, 권한 검사는 전적으로 여기 로직이 책임진다.

const FieldValue = admin.firestore.FieldValue;

const COLLECTION = "promises";
const PRIVATE = "private";
const AUTH_DOC = "auth";
export const MEMBERS = "members";

// 비밀번호 시도 제한: 10분 안에 10회
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function promiseRef(promiseId: string) {
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
export function memberRef(promiseId: string, uid: string) {
  return promiseRef(promiseId).collection(MEMBERS).doc(uid);
}

export interface CreatePromiseInput {
  title: string;
  date: string;
  time: string;
  location: string;
  meetingMode?: "inPerson" | "online";
  meetingUrl?: string | null;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string | null;
  password: string;
}

export interface PromiseSummary {
  id: string;
  title: string;
  creatorName: string | null;
  alreadyParticipant: boolean;
}

/** 해당 문서에서 이 사용자가 작성자인지 (v2 ID 우선, 레거시 이름 폴백). */
export function isCreatorOf(data: FirebaseFirestore.DocumentData, caller: Caller): boolean {
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
    meetingMode: input.meetingMode ?? "inPerson",
    meetingUrl: input.meetingUrl ?? null,
    locationLat: input.locationLat ?? null,
    locationLng: input.locationLng ?? null,
    locationPlaceId: input.locationPlaceId ?? null,
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
export function promiseInstant(data: FirebaseFirestore.DocumentData): Date | null {
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
export async function requireParticipant(
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

  // 기준은 약속 시각이 아니라 "내가 도착하려는 시각"이다. 30분 늦게 간다고
  // 적어둔 사람에게 정시 기준 출발 시각을 주면 그 값이 틀린 값이 된다.
  const target = targetArrival(data, (await ref.get()).data());
  const leaveAt = target
    ? new Date(target.getTime() - route.durationSec * 1000).toISOString()
    : null;

  await ref.set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      // 경로 안에도 출발지가 들어가지만, 경로와 별개로 origin에도 남긴다.
      // 경로를 지워도 출발지는 남아 있어야 장소 후보를 계산할 수 있다.
      origin: route.origin,
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

// ---------------------------------------------------------------- 즐겨찾기

/**
 * 즐겨찾기. participantIds와 같은 자리(약속 문서 자체)에 둔다.
 *
 * members/ 하위 컬렉션에 둘 수도 있었지만, 그러면 대시보드가 정렬하려고
 * 내 모든 플랜의 member 문서를 따로 읽어야 한다(플랜 수만큼 구독이 늘어남).
 * 문서 자체 필드로 두면 대시보드가 이미 구독하고 있는 promises 목록에
 * 자동으로 같이 실려 온다 — 참여자 목록을 배열로 두는 것과 같은 이유다.
 */
export async function setFavorite(
  caller: Caller,
  promiseId: string,
  favorite: boolean
): Promise<void> {
  await requireParticipant(promiseId, caller);

  await promiseRef(promiseId).update({
    favoritedBy: favorite
      ? FieldValue.arrayUnion(caller.uid)
      : FieldValue.arrayRemove(caller.uid),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------- 확정 / 다시 정하기

/**
 * 플랜을 확정하거나, 확정을 되돌린다. 만든 사람만.
 *
 * 되돌리기를 남겨둔 이유가 이 기능의 핵심이다. 확정한 뒤에 "그 장소는 나한테
 * 무리다"라는 말이 나올 수 있는데, 그때 방을 새로 파게 하면 그때까지의 투표와
 * 출발지가 전부 날아간다. 확정은 문 잠그기가 아니라 되돌릴 수 있는 표시다.
 *
 * 되돌려도 날짜·장소는 지우지 않는다. 지워버리면 "조금만 고치자"가 불가능해지고,
 * 어차피 다시 정하는 중 화면에서 바꿀 수 있다.
 */
export async function setPlanConfirmed(
  caller: Caller,
  promiseId: string,
  confirmed: boolean
): Promise<{ confirmedAt: string | null }> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("플랜을 찾을 수 없습니다.");
  const data = snap.data() as FirebaseFirestore.DocumentData;

  if (!isCreatorOf(data, caller)) {
    throw forbidden("확정은 플랜을 만든 사람만 할 수 있습니다.");
  }

  if (confirmed) {
    // 날짜나 장소가 비어 있는데 확정하면, 확정 화면이 "미정"을 크게 띄우는
    // 이상한 상태가 된다. 무엇이 없는지 그대로 알려준다.
    const missing: string[] = [];
    if (!promiseInstant(data)) missing.push("날짜");

    const online = data.meetingMode === "online";
    if (online) {
      if (!String(data.meetingUrl ?? "").trim()) missing.push("들어갈 링크");
    } else {
      const named = String(data.location ?? "").trim() !== "";
      const located =
        Number.isFinite(data.locationLat) && Number.isFinite(data.locationLng);
      if (!named || !located) missing.push("장소");
    }

    if (missing.length > 0) {
      throw badRequest(`${missing.join("와 ")}를 먼저 정해야 확정할 수 있습니다.`);
    }
  }

  const confirmedAt = confirmed ? new Date().toISOString() : null;
  await promiseRef(promiseId).update({
    confirmedAt,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { confirmedAt };
}

// ---------------------------------------------------- 내 도착 시각 · 참석

/**
 * 약속 날짜에 "HH:mm"을 얹어 실제 시각으로 만든다.
 *
 * promiseInstant와 같은 이유로 KST를 명시한다. 서버는 UTC로 도니까
 * new Date(y, m-1, d, hh, mm)으로 만들면 9시간이 밀린다.
 */
function instantOnPlanDate(
  data: FirebaseFirestore.DocumentData,
  hhmm: string
): Date | null {
  const raw = data.date;
  const [hh, mm] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  let y: number, m: number, d: number;
  if (raw && typeof raw.toDate === "function") {
    // 옛 문서는 date가 Timestamp다. KST 기준 날짜를 뽑아 쓴다.
    const base = raw.toDate() as Date;
    if (Number.isNaN(base.getTime())) return null;
    const kst = new Date(base.getTime() + 9 * 3_600_000);
    y = kst.getUTCFullYear();
    m = kst.getUTCMonth() + 1;
    d = kst.getUTCDate();
  } else {
    if (typeof raw !== "string") return null;
    [y, m, d] = raw.split("-").map(Number);
    if (!y || !m || !d) return null;
  }

  const instant = new Date(Date.UTC(y, m - 1, d, hh - 9, mm));
  if (Number.isNaN(instant.getTime())) return null;

  // 자정을 넘겨 도착하는 경우.
  //
  // 23시 약속에 "00:30에 도착"이라고 적으면 날짜만 붙였을 때 같은 날 00:30이
  // 되어 약속보다 22시간 반 *전*이 된다. 도착 시각은 약속 언저리의 값이므로,
  // 약속보다 12시간 넘게 이르면 다음 날로 넘어간 것으로 본다.
  const meetAt = promiseInstant(data);
  if (meetAt && meetAt.getTime() - instant.getTime() > 12 * 3_600_000) {
    return new Date(instant.getTime() + 24 * 3_600_000);
  }
  return instant;
}

/**
 * 이 사람이 실제로 도착하려는 시각. 적어둔 게 있으면 그것, 없으면 약속 시각.
 *
 * "나가야 하는 시각"(leaveAt)의 기준이다. 30분 늦게 간다고 적어놓고 출발
 * 시각은 정시 기준 그대로면, 이 앱이 파는 값이 바로 거짓말이 된다.
 */
function targetArrival(
  data: FirebaseFirestore.DocumentData,
  member: FirebaseFirestore.DocumentData | undefined
): Date | null {
  const own = member?.arrivalAt ? new Date(member.arrivalAt as string) : null;
  if (own && !Number.isNaN(own.getTime())) return own;
  return promiseInstant(data);
}

/**
 * "나는 오늘 몇 시까지 가요" — 본인 도착 예정 시각.
 *
 * 클라이언트가 ISO가 아니라 "HH:mm"을 보낸다. 날짜는 플랜에 이미 있으므로
 * 붙이는 건 서버가 한다 — 브라우저마다 시간대가 다를 수 있는데 그 계산을
 * 클라이언트에 맡기면 해외에서 열었을 때 엉뚱한 시각이 저장된다.
 *
 * null이면 지운다(= 약속 시각에 맞춰 온다는 뜻으로 되돌린다).
 */
export async function setMemberArrival(
  caller: Caller,
  promiseId: string,
  hhmm: string | null
): Promise<{ arrivalAt: string | null }> {
  const data = await requireParticipant(promiseId, caller);
  const ref = memberRef(promiseId, caller.uid);

  let arrivalAt: string | null = null;
  if (hhmm) {
    const at = instantOnPlanDate(data, hhmm);
    if (!at) throw badRequest("도착 시각이 올바르지 않습니다.");
    arrivalAt = at.toISOString();
  }

  // 도착 시각이 바뀌면 나가야 하는 시각도 따라 바뀐다.
  // 30분 늦게 간다고 적었는데 출발 시각이 정시 기준 그대로면 그 값이 거짓말이
  // 된다. 이미 고른 경로가 있을 때만 계산한다 — 소요시간을 모르면 뺄 게 없다.
  const mine = (await ref.get()).data();
  const durationSec = Number(mine?.route?.durationSec);
  const base = arrivalAt ? new Date(arrivalAt) : promiseInstant(data);
  const leaveAt =
    base && Number.isFinite(durationSec) && durationSec > 0
      ? new Date(base.getTime() - durationSec * 1000).toISOString()
      : (mine?.leaveAt ?? null);

  await ref.set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      arrivalAt,
      leaveAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { arrivalAt };
}

export type MemberAttendance = "going" | "cant";

/**
 * 이번 플랜에 갈지 말지. 방을 나가는 것(leavePromise)과 다르다.
 *
 * 나가기로 처리하지 않는 이유: 장소 때문에 못 가는 경우가 많은데, 그때 방에서
 * 빼버리면 장소가 바뀌어도 돌아올 방법이 비밀번호밖에 없다. 명단에는 남기고
 * 표시만 바꾼다 — 방장이 "한 명은 못 온다"를 보고 장소를 다시 정할 수 있게.
 */
export async function setMemberAttendance(
  caller: Caller,
  promiseId: string,
  attendance: MemberAttendance,
  reason?: string | null
): Promise<void> {
  const data = await requireParticipant(promiseId, caller);

  // **수확이 열린 뒤에는 못 바꾼다.**
  //
  // 안 막으면 구멍이 하나 생긴다 — 늦게 온 사람이 약속이 끝난 뒤에 "못 갔어요"로
  // 바꾸면 평가 대상에서 빠져 독사과를 피한다(harvestSubjects가 cant를 제외하기
  // 때문이다). 그 제외는 미리 말해준 사람을 보호하려는 것이지, 끝나고 말을
  // 바꾸는 사람을 위한 게 아니다.
  const win = harvestWindow(data as PromiseData);
  if (win === "open" || win === "closed") {
    throw badRequest("약속이 끝난 뒤에는 참석 여부를 바꿀 수 없어요.");
  }

  await memberRef(promiseId, caller.uid).set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      attendance,
      // 다시 간다고 하면 못 가는 이유는 남아 있을 이유가 없다.
      absenceReason: attendance === "cant" ? (reason ?? "").trim() || null : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * "이 장소면 가기 어려워요". null이면 거둔다.
 *
 * 어느 장소에 대한 말인지 같이 남긴다. 장소가 바뀌면 이 이의는 무효라서
 * place-service의 changePlace가 전원의 이의를 지우는데, 화면에서 "어디에
 * 대한 말이었는지" 보여줄 때도 쓴다.
 */
export async function setPlaceObjection(
  caller: Caller,
  promiseId: string,
  reason: string | null
): Promise<void> {
  const data = await requireParticipant(promiseId, caller);

  const objection =
    reason === null
      ? null
      : {
          reason: reason.trim().slice(0, 200),
          placeName: String(data.location ?? "").trim() || "정해진 장소",
          at: new Date().toISOString(),
        };

  await memberRef(promiseId, caller.uid).set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      placeObjection: objection,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
