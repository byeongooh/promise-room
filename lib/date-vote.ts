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

// ---------------------------------------------------------------- 확정 버튼
//
// **"안 돼요"가 있는 날에도 확정 버튼이 새까맣게 떠 있으면 안 된다.**
// 이 파일 맨 위에 "못 오는 사람이 한 명이라도 있으면 좋은 후보가 아니다"라고
// 적어놓고, 정작 버튼은 그걸 무시하고 있었다. 순위와 한 줄 평만 그 규칙을
// 따르고 버튼은 늘 같은 모습이면, 화면이 서로 다른 말을 하는 것이다.
//
// 그렇다고 막지는 않는다. "다들 못 온다지만 그날밖에 없다"는 사정은 실제로
// 있고, 그걸 아는 건 방장이지 이 코드가 아니다. **막는 대신 무게를 뺀다** —
// 버튼을 흐리게 하고, 문구를 "그래도"로 바꾸고, 한 번 더 묻는다.

export type ConfirmTone =
  /** 전원이 된다. 눌러도 되는 날 */
  | "ready"
  /** 아직 답이 덜 모였거나 애매한 사람이 있다. 눌러도 되지만 앞세우지 않는다 */
  | "soft"
  /** 못 온다는 사람이 있거나 이미 지난 날. 되돌리기 어려운 선택이라 한 번 더 묻는다 */
  | "override"
  /** 시간이 없어 확정 자체가 불가능하다. 서버가 거부한다 */
  | "needsTime";

export interface ConfirmStance {
  tone: ConfirmTone;
  /** 버튼에 쓸 말 */
  label: string;
  /** 버튼 아래 한 줄. 없으면 null */
  hint: string | null;
  /** 한 번 더 눌러야 실제로 확정되는가 */
  guard: boolean;
}

/**
 * "김병오 님은 못 온대요." — 이름이 보여야 조율이 된다.
 *
 * **알리는 문장이지 나무라는 문장이 아니다.** "안 돼요"는 원래 못 간다고
 * 전하라고 만든 표라서, 그걸 누른 사람이 잘못한 것처럼 읽히면 다음부터
 * 아무도 안 누르고 그냥 안 나타난다. 그게 훨씬 나쁘다.
 *
 * 문장을 통째로 만드는 이유: "외 2명"에는 "님"이 안 붙는다("김병오 외 2명 님은"은
 * 어색하다). 이름 목록만 돌려주고 바깥에서 "님은"을 붙이면 그 경우에 반드시 깨진다.
 */
function noVoterLine(option: DateOption, fallbackCount: number): string {
  const names = option.votes.filter((v) => v.vote === "no").map((v) => v.name || "참여자");
  if (names.length === 0) return `${fallbackCount}명은 못 온대요.`;
  if (names.length === 1) return `${names[0]} 님은 못 온대요.`;
  if (names.length === 2) return `${names[0]}·${names[1]} 님은 못 온대요.`;
  return `${names[0]} 외 ${names.length - 1}명은 못 온대요.`;
}

/** "YYYY-MM-DD"가 오늘보다 앞인가. 오늘은 지나지 않은 것으로 본다. */
function isPastDate(date: string, now: Date): boolean {
  const p = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return date < today;
}

/**
 * 확정 버튼이 어떤 얼굴이어야 하는가.
 *
 * 판단 순서가 곧 중요도다. 앞의 것이 뒤의 것을 덮는다.
 *   1. 시간이 없으면 확정 자체가 안 된다 — 다른 사정을 따질 것도 없다
 *   2. 지난 날짜는 대개 실수다
 *   3. 못 온다는 사람이 있으면 이 파일의 규칙에 어긋난다
 *   4. 답이 덜 모였거나 애매한 사람이 있으면 조금 미뤄도 된다
 *   5. 그 외에는 눌러도 되는 날
 */
export function confirmStance(
  option: DateOption,
  t: DateTally,
  participantCount: number,
  now: Date = new Date()
): ConfirmStance {
  const past = isPastDate(option.date, now);

  if (!option.time) {
    // 시간이 없으면 서버가 거부한다. 다만 지난 날짜라는 사실까지 여기서
    // 같이 말해줘야 한다 — 시간을 넣고 나서야 "사실 지난 날짜였다"가 나오면
    // 사용자를 한 번 헛돌린 셈이다.
    return {
      tone: "needsTime",
      label: "시간 정하고 확정하기",
      hint: past
        ? "이미 지난 날짜예요. 시간까지 있어야 확정할 수 있어요."
        : "시간까지 있어야 몇 시에 나가야 하는지 계산할 수 있어요.",
      guard: false,
    };
  }

  if (past) {
    return {
      tone: "override",
      label: "그래도 이 날짜로 정하기",
      hint: "이미 지난 날짜예요.",
      guard: true,
    };
  }

  // 못 오는 사람이 있어도 나머지끼리 만나는 건 정상이다. 여기서 "그래도"
  // 같은 말을 쓰면 방장이 뭘 어기는 것처럼 읽히고, 그러면 "안 돼요"를 누른
  // 사람도 눈치가 보인다. **몇 명이 되는 날인지를 그냥 말해준다.**
  if (t.no > 0 && t.ok > 0) {
    return {
      tone: "soft",
      label: `${t.ok}명이 되는 날로 정하기`,
      hint: noVoterLine(option, t.no),
      guard: false,
    };
  }

  // 다만 확실히 오는 사람이 하나도 없으면 이야기가 다르다. 그건 모임이 아니다.
  //
  // "아무도 못 온다"고 뭉뚱그리지 않는다. 애매한 사람은 올 수도 있고, 아직
  // 답 안 한 사람은 아무 말도 안 한 것이다. 없는 사실을 단정하면 그 문장을
  // 보고 멀쩡한 날짜를 접는다.
  if (t.no > 0) {
    return {
      tone: "override",
      label: "그래도 이 날짜로 정하기",
      hint:
        t.maybe > 0
          ? "확실히 온다는 사람이 아직 없어요."
          : t.pending > 0
            ? "지금까지 답한 사람은 모두 못 온대요."
            : "아무도 못 오는 날이에요.",
      guard: true,
    };
  }

  if (participantCount > 0 && t.pending === participantCount) {
    return {
      tone: "soft",
      label: "이 날짜로 정하기",
      hint: "아직 아무도 답을 안 했어요.",
      guard: false,
    };
  }

  if (t.pending > 0) {
    return {
      tone: "soft",
      label: "이 날짜로 정하기",
      hint: `${t.pending}명이 아직 답을 안 했어요.`,
      guard: false,
    };
  }

  if (t.maybe > 0) {
    return {
      tone: "soft",
      label: "이 날짜로 정하기",
      hint: `${t.maybe}명이 애매하대요.`,
      guard: false,
    };
  }

  return { tone: "ready", label: "이 날짜로 정하기", hint: null, guard: false };
}
