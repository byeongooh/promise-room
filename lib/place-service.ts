import { admin, db } from "@/lib/firebaseAdmin";
import { badRequest, forbidden, notFound, type Caller } from "@/lib/api-guard";
import { getCarRoute, type Coordinate } from "@/lib/directions";
import { getTransitRoutes } from "@/lib/transit";
import { summarize } from "@/lib/place-compare";
import { isSameUser } from "@/lib/uid";
import {
  MEMBERS,
  isCreatorOf,
  memberRef,
  promiseInstant,
  promiseRef,
  requireParticipant,
} from "@/lib/promise-service";
import type {
  PlaceCheck,
  PlaceMemberTime,
  PlaceSummary,
  PlaceSuggestion,
} from "@/lib/types";

// 약속 장소를 바꾸고, 다 같이 편한 곳을 찾는 서버 로직.
//
// promise-service.ts와 같은 규칙을 따른다 — Admin SDK는 보안 규칙을 우회하므로
// 권한 검사는 전적으로 여기가 책임진다. 권한 판단 자체는 promise-service의
// 것을 그대로 가져다 쓴다(복사하면 언젠가 두 곳이 어긋난다).
//
// **외부 API 사용량 주의.** 참여자 N명이면 후보 한 곳을 계산할 때 N번 부른다.
// ODsay가 하루 1천 건이라 5명 기준 하루 200번쯤이 한계다. 그래서
//   - 자동으로 부르지 않는다. 사용자가 후보를 고를 때만 부른다.
//   - 한 사람당 한 방식만 부른다(이미 고른 방식, 없으면 대중교통).
//   - 제안 목록은 저장해둔 요약을 보여주고 다시 계산하지 않는다.

const FieldValue = admin.firestore.FieldValue;

/** 문서에 저장할 좌표 한 벌. */
export interface PlacePoint {
  label: string;
  lat: number;
  lng: number;
}

/**
 * 출발지만 따로 정해두기.
 *
 * 경로를 고르지 않아도 출발지는 정할 수 있어야 한다. 후보를 계산할 때 참여자
 * 전원의 출발지가 필요한데 "경로를 고른 사람만" 넣으면, 이제 막 만든 플랜은
 * 표본이 한둘뿐이라 비교가 무의미해진다.
 */
export async function setMemberOrigin(
  caller: Caller,
  promiseId: string,
  origin: PlacePoint | null
): Promise<void> {
  await requireParticipant(promiseId, caller);

  await memberRef(promiseId, caller.uid).set(
    {
      uid: caller.uid,
      name: caller.name?.trim() || "이름 없음",
      origin,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** member 문서에서 쓸 수 있는 출발지를 꺼낸다. 예전 문서는 route 안에만 있다. */
function originOf(m: FirebaseFirestore.DocumentData): PlacePoint | null {
  const direct = m.origin;
  if (direct && Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) {
    return { label: String(direct.label ?? "출발지"), lat: direct.lat, lng: direct.lng };
  }
  // origin 필드가 생기기 전에 저장된 문서 — 경로 안의 출발지로 물러선다.
  const viaRoute = m.route?.origin;
  if (viaRoute && Number.isFinite(viaRoute.lat) && Number.isFinite(viaRoute.lng)) {
    return { label: String(viaRoute.label ?? "출발지"), lat: viaRoute.lat, lng: viaRoute.lng };
  }
  return null;
}

interface MemberOrigin {
  uid: string;
  name: string;
  origin: PlacePoint;
  kind: "car" | "transit";
}

async function readMemberOrigins(
  promiseId: string,
  data: FirebaseFirestore.DocumentData
): Promise<{ withOrigin: MemberOrigin[]; skippedNames: string[] }> {
  const snap = await promiseRef(promiseId).collection(MEMBERS).get();

  const byUid = new Map<string, FirebaseFirestore.DocumentData>();
  snap.forEach((d) => byUid.set(d.id, d.data()));

  const ids: string[] = data.participantIds ?? [];
  const names: string[] = data.participantNames ?? [];

  const withOrigin: MemberOrigin[] = [];
  const skippedNames: string[] = [];

  ids.forEach((uid, i) => {
    const m = byUid.get(uid);
    const name = (m?.name as string) || names[i] || "참여자";
    const origin = m ? originOf(m) : null;

    if (!origin) {
      skippedNames.push(name);
      return;
    }
    withOrigin.push({
      uid,
      name,
      origin,
      // 이미 고른 방식이 있으면 그걸 쓴다. 없으면 대중교통 — 모임 장소를
      // 고를 때 기준이 되는 건 보통 자동차가 아니라 지하철이다.
      kind: m?.route?.kind === "car" ? "car" : "transit",
    });
  });

  return { withOrigin, skippedNames };
}

/**
 * 한 사람이 한 장소까지 가는 데 걸리는 시간.
 * 대중교통이 실패하면 자동차로 물러선다. 둘 다 안 되면 null이라 계산에서 빠진다.
 */
async function travelSec(
  origin: Coordinate,
  destination: Coordinate,
  kind: "car" | "transit"
): Promise<{ sec: number; kind: "car" | "transit" } | null> {
  if (kind === "car") {
    try {
      const car = await getCarRoute(origin, destination);
      return { sec: car.durationSec, kind: "car" };
    } catch {
      return null;
    }
  }

  try {
    const best = (await getTransitRoutes(origin, destination))[0];
    if (best) return { sec: best.durationSec, kind: "transit" };
  } catch {
    // 아래에서 자동차로 물러선다.
  }

  try {
    const car = await getCarRoute(origin, destination);
    return { sec: car.durationSec, kind: "car" };
  } catch {
    return null;
  }
}

/** 후보 장소 하나에 대해 참여자 전원의 이동시간을 계산한다. */
export async function checkPlace(
  caller: Caller,
  promiseId: string,
  place: { name: string; address: string; lat: number; lng: number }
): Promise<PlaceCheck> {
  const data = await requireParticipant(promiseId, caller);

  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    throw badRequest("장소 좌표가 없습니다.");
  }

  const { withOrigin, skippedNames } = await readMemberOrigins(promiseId, data);
  const destination = { lat: place.lat, lng: place.lng };

  // 지금 약속 장소까지의 시간도 같이 재서 "몇 분 늘고 줄었는지"를 만든다.
  const current =
    Number.isFinite(data.locationLat) && Number.isFinite(data.locationLng)
      ? { lat: data.locationLat as number, lng: data.locationLng as number }
      : null;

  const rows = await Promise.all(
    withOrigin.map(async (m) => {
      const [to, base] = await Promise.all([
        travelSec(m.origin, destination, m.kind),
        current ? travelSec(m.origin, current, m.kind) : Promise.resolve(null),
      ]);
      return { m, to, base };
    })
  );

  const members: PlaceMemberTime[] = [];
  const skipped = [...skippedNames];

  for (const { m, to, base } of rows) {
    if (!to) {
      // 길을 못 찾은 사람도 빠진다. 0으로 넣으면 평균이 거짓말이 된다.
      skipped.push(m.name);
      continue;
    }
    members.push({
      uid: m.uid,
      name: m.name,
      originLabel: m.origin.label,
      kind: to.kind,
      durationSec: to.sec,
      deltaSec: base ? to.sec - base.sec : null,
    });
  }

  members.sort((a, b) => a.durationSec - b.durationSec);

  return {
    place,
    summary: summarize(
      members.map((r) => r.durationSec),
      skipped.length
    ),
    members,
    skippedNames: skipped,
  };
}

/**
 * 약속 장소 변경. 만든 사람만.
 *
 * 장소가 바뀌면 참여자들이 저장해둔 경로의 소요시간은 더 이상 맞지 않는다.
 * 그래서 각자의 출발지에서 새 장소까지 다시 재어 durationSec과 leaveAt을
 * 갱신한다. 다만 노선 상세(mapObj·환승·요금)는 지운다 — 옛 목적지 기준으로
 * 받아둔 값이라 그대로 두면 지도에 엉뚱한 길이 그려진다. 다시 그리려면 각자
 * 경로를 한 번 더 고르면 되고, 그 전에도 "몇 시에 나가야 하는지"는 맞다.
 */
export async function changePlace(
  caller: Caller,
  promiseId: string,
  place: { name: string; lat: number; lng: number; placeId?: string | null }
): Promise<{ recalculated: number }> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("플랜을 찾을 수 없습니다.");
  const data = snap.data() as FirebaseFirestore.DocumentData;

  if (!isCreatorOf(data, caller)) {
    throw forbidden("약속 장소는 플랜을 만든 사람만 바꿀 수 있습니다.");
  }
  if (!place.name?.trim()) throw badRequest("장소 이름이 없습니다.");
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    throw badRequest("장소 좌표가 없습니다.");
  }

  await promiseRef(promiseId).update({
    location: place.name.trim(),
    locationLat: place.lat,
    locationLng: place.lng,
    locationPlaceId: place.placeId ?? null,
    // 장소가 바뀌면 옛 제안은 의미가 없다. 같이 비운다.
    placeSuggestions: [],
    updatedAt: FieldValue.serverTimestamp(),
  });

  const { withOrigin } = await readMemberOrigins(promiseId, data);
  const meetAt = promiseInstant(data);
  const destination = { lat: place.lat, lng: place.lng };

  const results = await Promise.all(
    withOrigin.map(async (m) => ({ m, to: await travelSec(m.origin, destination, m.kind) }))
  );

  let recalculated = 0;
  await Promise.all(
    results.map(async ({ m, to }) => {
      if (!to) return;
      recalculated += 1;
      await memberRef(promiseId, m.uid).set(
        {
          route: {
            kind: to.kind,
            label: to.kind === "car" ? "자동차" : "대중교통",
            durationSec: to.sec,
            origin: m.origin,
            // 옛 목적지 기준 값이라 버린다. 지도를 다시 그리려면 새로 고른다.
            mapObj: null,
            transfers: null,
            fare: null,
            firstStation: null,
          },
          leaveAt: meetAt ? new Date(meetAt.getTime() - to.sec * 1000).toISOString() : null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );

  return { recalculated };
}

/** 참여자가 계산해본 곳을 만든 사람에게 올린다. */
export async function addPlaceSuggestion(
  caller: Caller,
  promiseId: string,
  place: { name: string; address: string; lat: number; lng: number },
  summary: PlaceSummary
): Promise<PlaceSuggestion> {
  await requireParticipant(promiseId, caller);

  const suggestion: PlaceSuggestion = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    place,
    byUid: caller.uid,
    byName: caller.name?.trim() || "참여자",
    createdAt: new Date().toISOString(),
    summary,
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(promiseRef(promiseId));
    const list: PlaceSuggestion[] = snap.data()?.placeSuggestions ?? [];

    // 같은 사람이 같은 곳을 또 올리면 최신 것만 남긴다.
    const kept = list.filter((s) => !(s.byUid === caller.uid && s.place.name === place.name));
    // 문서가 무한정 커지지 않도록 최근 10건까지만 남긴다.
    tx.update(promiseRef(promiseId), {
      placeSuggestions: [suggestion, ...kept].slice(0, 10),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return suggestion;
}

/** 제안 거두기. 올린 본인 또는 만든 사람. */
export async function removePlaceSuggestion(
  caller: Caller,
  promiseId: string,
  suggestionId: string
): Promise<void> {
  const data = await requireParticipant(promiseId, caller);
  const owner = isCreatorOf(data, caller);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(promiseRef(promiseId));
    const list: PlaceSuggestion[] = snap.data()?.placeSuggestions ?? [];
    const target = list.find((s) => s.id === suggestionId);
    if (!target) return;

    if (!owner && !isSameUser(target.byUid, caller.uid)) {
      throw forbidden("내가 올린 제안만 거둘 수 있습니다.");
    }

    tx.update(promiseRef(promiseId), {
      placeSuggestions: list.filter((s) => s.id !== suggestionId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
