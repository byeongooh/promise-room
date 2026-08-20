import { admin, db } from "@/lib/firebaseAdmin";
import { badRequest, forbidden, notFound, type Caller } from "@/lib/api-guard";
import { isSameUser } from "@/lib/uid";
import {
  MEMBERS,
  isCreatorOf,
  memberRef,
  promiseInstant,
  promiseRef,
  requireParticipant,
} from "@/lib/promise-service";
import type { DateOption, DateVote } from "@/lib/types";

// 언제 만날지 맞추는 서버 로직.
//
// 장소(place-service.ts)와 짝을 이룬다. 다른 점은 계산할 숫자가 없다는 것 —
// 이동시간처럼 객관적으로 잴 수 있는 값이 없어서 각자에게 물어보는 수밖에 없다.
// 그래서 여기는 외부 API를 부르지 않고, 대신 표를 모은다.
//
// 권한은 장소와 같은 모양이다.
//   후보 올리기·투표 → 참여자 누구나 (아무것도 확정하지 않는다)
//   실제로 날짜 정하기 → 만든 사람만

const FieldValue = admin.firestore.FieldValue;

const MAX_OPTIONS = 10;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 날짜 후보 올리기. 같은 날짜·시간이 이미 있으면 그걸 그대로 쓴다. */
export async function addDateOption(
  caller: Caller,
  promiseId: string,
  input: { date: string; time: string }
): Promise<DateOption> {
  await requireParticipant(promiseId, caller);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw badRequest("날짜 형식이 올바르지 않습니다.");
  }
  if (input.time && !/^\d{2}:\d{2}$/.test(input.time)) {
    throw badRequest("시간 형식이 올바르지 않습니다.");
  }

  const option: DateOption = {
    id: newId(),
    date: input.date,
    time: input.time,
    byUid: caller.uid,
    byName: caller.name?.trim() || "참여자",
    createdAt: new Date().toISOString(),
    // 올린 사람은 그 날짜가 된다고 보는 게 자연스럽다. 한 번 더 누르게 하지 않는다.
    votes: [{ uid: caller.uid, name: caller.name?.trim() || "참여자", vote: "ok" }],
  };

  let saved = option;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(promiseRef(promiseId));
    const list: DateOption[] = snap.data()?.dateOptions ?? [];

    const same = list.find((o) => o.date === input.date && o.time === input.time);
    if (same) {
      // 이미 있는 후보다. 새로 만들지 말고 이 사람 표만 얹는다.
      saved = same;
      const votes = same.votes.filter((v) => !isSameUser(v.uid, caller.uid));
      votes.push({ uid: caller.uid, name: option.byName, vote: "ok" });
      const next = list.map((o) => (o.id === same.id ? { ...o, votes } : o));
      tx.update(promiseRef(promiseId), {
        dateOptions: next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (list.length >= MAX_OPTIONS) {
      throw badRequest(`날짜 후보는 ${MAX_OPTIONS}개까지 올릴 수 있어요.`);
    }

    tx.update(promiseRef(promiseId), {
      dateOptions: [...list, option],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return saved;
}

/** 이 날짜에 올 수 있는지 답하기. 같은 사람이 다시 누르면 갈아 끼운다. */
export async function voteDateOption(
  caller: Caller,
  promiseId: string,
  optionId: string,
  vote: DateVote
): Promise<void> {
  await requireParticipant(promiseId, caller);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(promiseRef(promiseId));
    const list: DateOption[] = snap.data()?.dateOptions ?? [];
    if (!list.some((o) => o.id === optionId)) throw notFound("그 날짜 후보가 없습니다.");

    const name = caller.name?.trim() || "참여자";
    const next = list.map((o) =>
      o.id === optionId
        ? { ...o, votes: [...o.votes.filter((v) => !isSameUser(v.uid, caller.uid)), { uid: caller.uid, name, vote }] }
        : o
    );

    tx.update(promiseRef(promiseId), {
      dateOptions: next,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/** 후보 거두기. 올린 본인 또는 만든 사람. */
export async function removeDateOption(
  caller: Caller,
  promiseId: string,
  optionId: string
): Promise<void> {
  const data = await requireParticipant(promiseId, caller);
  const owner = isCreatorOf(data, caller);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(promiseRef(promiseId));
    const list: DateOption[] = snap.data()?.dateOptions ?? [];
    const target = list.find((o) => o.id === optionId);
    if (!target) return;

    if (!owner && !isSameUser(target.byUid, caller.uid)) {
      throw forbidden("내가 올린 후보만 거둘 수 있습니다.");
    }

    tx.update(promiseRef(promiseId), {
      dateOptions: list.filter((o) => o.id !== optionId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * 날짜 확정. 만든 사람만.
 *
 * 확정하면 참여자들의 출발 시각(leaveAt)을 다시 계산한다. 소요시간 자체는
 * 장소가 그대로라 안 바뀌지만, leaveAt은 "약속 시각 − 소요시간"이라 날짜가
 * 정해지는 순간 처음으로 값이 생긴다(그전까지는 null이었다).
 */
export async function confirmDate(
  caller: Caller,
  promiseId: string,
  input: { date: string; time: string }
): Promise<{ recalculated: number }> {
  const snap = await promiseRef(promiseId).get();
  if (!snap.exists) throw notFound("플랜을 찾을 수 없습니다.");
  const data = snap.data() as FirebaseFirestore.DocumentData;

  if (!isCreatorOf(data, caller)) {
    throw forbidden("약속 날짜는 플랜을 만든 사람만 정할 수 있습니다.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw badRequest("날짜 형식이 올바르지 않습니다.");
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    throw badRequest("시간까지 정해야 출발 시각을 계산할 수 있어요.");
  }

  await promiseRef(promiseId).update({
    date: input.date,
    time: input.time,
    // 날짜가 정해지면 후보는 더 이상 의미가 없다.
    dateOptions: [],
    updatedAt: FieldValue.serverTimestamp(),
  });

  // leaveAt 다시 계산 — 여기서 처음으로 값이 생긴다.
  const meetAt = promiseInstant({ ...data, date: input.date, time: input.time });

  const members = await promiseRef(promiseId).collection(MEMBERS).get();
  let recalculated = 0;

  await Promise.all(
    members.docs.map(async (d) => {
      const m = d.data();

      // 각자 적어둔 도착 시각은 옛 날짜에 붙어 있다. 날짜가 바뀌면 그대로
      // 두는 순간 "3월 15일 6시 30분 도착"처럼 지난 날짜를 가리키게 되고,
      // 그걸 기준으로 출발 시각까지 계산되면 값이 통째로 거짓말이 된다.
      // 장소를 바꿀 때 장소 이의를 지우는 것과 같은 판단이다.
      const hadArrival = !!m.arrivalAt;
      const sec = m.route?.durationSec;
      const canLeave = meetAt && Number.isFinite(sec);

      if (!hadArrival && !canLeave) return;
      if (canLeave) recalculated += 1;

      await memberRef(promiseId, d.id).set(
        {
          ...(hadArrival ? { arrivalAt: null } : {}),
          ...(canLeave
            ? { leaveAt: new Date(meetAt!.getTime() - (sec as number) * 1000).toISOString() }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );

  return { recalculated };
}
