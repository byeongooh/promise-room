import { admin, db } from "@/lib/firebaseAdmin";
import { badRequest, notFound, type Caller } from "@/lib/api-guard";
import type { CalendarNote } from "@/lib/types";

// 달력 메모 — users/{uid}/notes/{id}.
//
// **읽기까지 서버를 거치는 유일한 자리다.** 이 프로젝트는 읽기를 클라이언트가
// Firestore에서 직접 하는 게 기본인데(참여자 상태처럼 실시간이어야 하는 게
// 있어서), 메모는 나만 쓰고 나만 본다. 실시간일 이유가 없다.
//
// 그렇게 하면 얻는 게 하나 있다. `users/` 컬렉션에 대한 보안 규칙을 새로 짜서
// **Firebase 콘솔에 배포하지 않아도 된다** — 그건 사람이 직접 해야 하는 일이라,
// 안 만들고 넘어갈 수 있으면 안 만드는 게 낫다. 규칙은 지금도 클라이언트의
// users/ 접근을 전부 막고 있고, 이 파일만 Admin SDK로 들어간다.
//
// 나중에 수확에서 users/{uid} 문서(brix·poisonApples)가 필요해지면 그때
// 규칙을 한 번에 만든다. 그때까지 미룰 수 있는 일이다.

const FieldValue = admin.firestore.FieldValue;

/** 한 사람이 들고 있을 법한 최대치. 넘으면 오래된 것부터 잘린다. */
const MAX_NOTES = 500;

function notesRef(uid: string) {
  return db.collection("users").doc(uid).collection("notes");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 내 메모 전부. 달력이 월을 넘길 때마다 다시 부르지 않도록 한 번에 준다. */
export async function listNotes(caller: Caller): Promise<CalendarNote[]> {
  const snap = await notesRef(caller.uid).orderBy("date", "desc").limit(MAX_NOTES).get();

  return snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      date: String(v.date ?? ""),
      text: String(v.text ?? ""),
      promiseId: (v.promiseId as string | null | undefined) ?? null,
      done: v.done === true,
      createdAt:
        typeof v.createdAt?.toDate === "function"
          ? (v.createdAt.toDate() as Date).toISOString()
          : String(v.createdAt ?? ""),
    };
  });
}


/**
 * 메모 한 줄 추가.
 *
 * 날짜는 클라이언트가 준 "YYYY-MM-DD"를 그대로 쓴다. 도착 시각(setMemberArrival)은
 * 서버가 날짜를 붙였는데 여기는 반대인 이유: 저건 "약속 날짜"라는 기준이 서버에
 * 있었지만, 메모는 사용자가 달력에서 **직접 고른 칸**이 곧 날짜다. 그 칸을 정한
 * 건 사용자의 화면이므로 그 값을 그대로 받는 게 맞다.
 */
export async function addNote(
  caller: Caller,
  date: string,
  text: string,
  promiseId?: string | null
): Promise<CalendarNote> {
  if (!DATE_RE.test(date)) throw badRequest("날짜 형식이 올바르지 않습니다.");

  const body = text.trim();
  if (!body) throw badRequest("메모 내용이 비어 있습니다.");
  if (body.length > 200) throw badRequest("메모는 200자까지 쓸 수 있습니다.");

  // 약속에 딸린 것인지 아닌지만 구분한다. 그 약속에 실제로 참여 중인지는
  // 확인하지 않는다 — 이 메모는 남에게 안 보이고 내 달력에만 뜨므로,
  // 엉뚱한 id를 넣어봐야 자기 화면에 안 붙는 메모가 하나 생길 뿐이다.
  const linked = promiseId?.trim() || null;

  const ref = notesRef(caller.uid).doc();
  await ref.set({
    date,
    text: body,
    promiseId: linked,
    done: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    id: ref.id,
    date,
    text: body,
    promiseId: linked,
    done: false,
    createdAt: new Date().toISOString(),
  };
}

/** 챙겼는지 표시. 체크리스트로 쓰일 때만 의미가 있다. */
export async function setNoteDone(
  caller: Caller,
  noteId: string,
  done: boolean
): Promise<void> {
  const ref = notesRef(caller.uid).doc(noteId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("메모를 찾을 수 없습니다.");
  await ref.update({ done });
}

/** 메모 지우기. 남의 메모는 애초에 경로가 caller.uid라 닿지 않는다. */
export async function removeNote(caller: Caller, noteId: string): Promise<void> {
  const ref = notesRef(caller.uid).doc(noteId);
  const snap = await ref.get();
  if (!snap.exists) throw notFound("메모를 찾을 수 없습니다.");
  await ref.delete();
}
