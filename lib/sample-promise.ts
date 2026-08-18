import type { PromiseData } from "./types";

// 처음 들어온 사람에게 "약속이 어떻게 보이는지"를 알려주는 예시 한 장.
//
// Firestore에 넣지 않고 화면에서만 만든다. 저장하면
//  - 모든 사용자를 participantIds에 넣어야 해서 사용자가 늘수록 문서가 커지고,
//  - 남이 나가거나 지울 수 있는 진짜 약속이 되어 버린다.
// 예시는 보여주기만 하면 되므로 데이터로 만들 이유가 없다.

export const SAMPLE_PROMISE_ID = "__sample__";

/** 날짜가 늘 앞날이어야 D-day가 말이 되므로 볼 때마다 계산한다. */
export function getSamplePromise(now: Date = new Date()): PromiseData & { id: string } {
  // 다음 토요일 저녁 7시. 오늘이 토요일이면 일주일 뒤로 넘긴다.
  const when = new Date(now);
  const untilSaturday = (6 - when.getDay() + 7) % 7 || 7;
  when.setDate(when.getDate() + untilSaturday);

  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");

  return {
    id: SAMPLE_PROMISE_ID,
    title: "저녁 같이 먹기",
    date: `${yyyy}-${mm}-${dd}`,
    time: "19:00",
    location: "성수역 3번 출구",
    creatorName: "예시",
    participantNames: ["나", "친구", "친구2"],
    participantIds: [],
  };
}
