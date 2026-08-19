import type { DateOption, DateTally, DateVote } from "@/lib/types";

// 날짜 후보를 견주는 기준.
//
// 장소는 이동시간이라는 객관적인 숫자가 있어서 평균·최장·편차로 줄 세울 수
// 있었다. 날짜는 그런 게 없다. 각자 되는지 안 되는지를 물어보는 수밖에 없고,
// 그래서 여기서 정하는 건 "어떻게 세느냐"다.
//
// 규칙 하나: **못 오는 사람이 한 명이라도 있으면 좋은 후보가 아니다.**
// 5명 중 4명이 되는 날보다 3명 전원이 되는 날이 낫다. 모임은 참석률이 아니라
// "그날 우리가 만나는가"의 문제라서, ok 수가 많아도 no가 있으면 뒤로 민다.

export function tally(option: DateOption, participantCount: number): DateTally {
  let ok = 0;
  let maybe = 0;
  let no = 0;

  for (const v of option.votes) {
    if (v.vote === "ok") ok += 1;
    else if (v.vote === "maybe") maybe += 1;
    else no += 1;
  }

  return { ok, maybe, no, pending: Math.max(0, participantCount - option.votes.length) };
}

/**
 * 후보 정렬. 앞에 올수록 좋은 후보다.
 *
 *   1. 못 오는 사람이 적은 순   — 한 명이라도 못 오면 모임이 반쪽이 된다
 *   2. 확실히 오는 사람이 많은 순
 *   3. 아직 답 안 한 사람이 적은 순 — 답이 다 모인 쪽이 믿을 만하다
 *   4. 날짜가 빠른 순
 */
export function rankOptions(options: DateOption[], participantCount: number): DateOption[] {
  return [...options].sort((a, b) => {
    const ta = tally(a, participantCount);
    const tb = tally(b, participantCount);

    if (ta.no !== tb.no) return ta.no - tb.no;
    if (ta.ok !== tb.ok) return tb.ok - ta.ok;
    if (ta.pending !== tb.pending) return ta.pending - tb.pending;
    return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
  });
}

/**
 * 후보 하나에 대한 한 줄 평.
 *
 * 숫자를 읽지 않아도 결론이 보이게. 순서가 곧 우선순위다 — "다 되는 날"이
 * 있으면 그것부터 말하고, 못 오는 사람이 있으면 그 사실을 먼저 말한다.
 */
export function dateVerdict(
  t: DateTally,
  participantCount: number
): { tone: "best" | "good" | "blocked" | "waiting"; line: string } {
  if (participantCount === 0) return { tone: "waiting", line: "참여자가 없어요." };

  if (t.no > 0) {
    return {
      tone: "blocked",
      line: `${t.no}명이 못 와요.`,
    };
  }
  if (t.pending > 0) {
    return {
      tone: "waiting",
      line: `${t.pending}명이 아직 답을 안 했어요.`,
    };
  }
  if (t.maybe > 0) {
    return {
      tone: "good",
      line: `다 올 수 있는데 ${t.maybe}명이 애매해요.`,
    };
  }
  return { tone: "best", line: "모두 올 수 있는 날이에요." };
}

export const VOTE_LABEL: Record<DateVote, string> = {
  ok: "돼요",
  maybe: "애매해요",
  no: "안 돼요",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "9월 4일 (금) 19:30" — 시간이 없으면 날짜까지만. */
export function formatOption(option: Pick<DateOption, "date" | "time">): string {
  const [y, m, d] = option.date.split("-").map(Number);
  if (!y || !m || !d) return option.date;

  const when = new Date(y, m - 1, d);
  const w = WEEKDAYS[when.getDay()] ?? "";
  const head = `${m}월 ${d}일 (${w})`;
  return option.time ? `${head} ${option.time}` : `${head} 시간 미정`;
}
