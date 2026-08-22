import type { Timestamp } from "firebase/firestore";

export interface PromiseData {
  id?: string;
  title: string;
  date: string | Timestamp;
  time: string;
  /** 오프라인이면 장소 이름. 아직 안 정했으면 빈 문자열("장소 정하는 중"). */
  location: string;
  /**
   * 어떻게 만나는지. 값이 없는 옛 플랜은 전부 직접 만남으로 본다.
   * 온라인이면 이동시간이라는 개념이 없어서 출발지·경로·장소 비교가 다 빠진다.
   * 판단은 lib/meeting-mode.ts 한 곳에서만 한다.
   */
  meetingMode?: "inPerson" | "online";
  /** 온라인 플랜의 참여 링크(Zoom·디스코드·구글 미트 등). http(s)만 허용. */
  meetingUrl?: string | null;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string | null;
  /** 지각 벌칙(자유 텍스트) — 독사과로 대체하면서 새로 만들지 않는다.
   *  옛 플랜에 남아 있는 값을 읽지 못해 오류가 나지 않도록 타입만 남긴다. */
  penalty?: string;
  status?: string;

  /**
   * 만든 사람이 "이걸로 하자"를 누른 시각(ISO). 플랜이 정하는 중인지
   * 확정인지를 가르는 유일한 값이다.
   *
   * 세 가지 상태를 구분해야 해서 boolean이 아니다.
   *   - 없음(undefined) : 확정 개념이 생기기 전에 만든 옛 플랜.
   *                       날짜·장소가 다 있으면 확정으로 본다.
   *   - null            : 확정했다가 되돌린 것. "다시 정하는 중"이다.
   *   - ISO 문자열      : 확정. 언제 확정했는지도 같이 남는다.
   *
   * 되돌릴 수 있게 만든 이유: 확정 뒤에 "이 장소는 가기 어렵다"는 말이
   * 나올 수 있고, 그때 방을 새로 파게 하는 건 말이 안 된다.
   * 판단은 lib/plan-phase.ts 한 곳에서만 한다.
   */
  confirmedAt?: string | null;
  // 비밀번호는 이 문서에 저장하지 않는다. 해시가 promises/{id}/private/auth 에
  // 따로 있고 서버만 접근한다 (규칙은 필드 단위로 가릴 수 없기 때문).

  // 구버전(v1): 이름 기반
  creator?: string;
  participants?: string[];

  // v2: ID 기반
  creatorId?: string;
  creatorName?: string;
  participantIds?: string[];
  participantNames?: string[];

  /** 이 플랜을 즐겨찾기한 사람들의 uid. participantIds와 같은 방식(배열)이라
   *  대시보드가 이미 구독 중인 목록에 그대로 실려 온다. */
  favoritedBy?: string[];

  /**
   * 참여자들이 계산해보고 올린 장소 후보. 만든 사람만 이 중 하나를 고를 수 있다.
   *
   * 하위 컬렉션이 아니라 문서 안 배열인 이유: 하위 컬렉션으로 만들면 보안 규칙을
   * 새로 짜서 콘솔에 배포해야 하는데(사람이 직접 해야 하는 일), 제안은 한 플랜에
   * 몇 건 수준이라 문서에 실어도 무겁지 않다. favoritedBy와 같은 판단이다.
   */
  placeSuggestions?: PlaceSuggestion[];

  /**
   * 언제 만날지 맞추는 중일 때 올라온 날짜 후보들.
   *
   * placeSuggestions와 같은 자리·같은 이유(문서 안 배열)다. 다른 점은 여기엔
   * 참여자들의 O/△/X가 같이 붙는다는 것 — 장소는 이동시간이라는 객관적인
   * 숫자로 견줄 수 있지만, 날짜는 각자 되는지 안 되는지를 물어보는 수밖에 없다.
   */
  dateOptions?: DateOption[];

  /**
   * 수확 정산 결과. 아직 정산 전이면 없다.
   *
   * **표(ballot)는 여기 없다.** 표는 promises/{id}/harvest/{uid}에 따로 있고
   * 보안 규칙 기본값(전부 차단)에 막혀 클라이언트가 못 읽는다. 그래야
   * "전원이 낼 때까지 서로 못 본다"가 성립한다. 여기 올라오는 건 정산이
   * 끝난 뒤의 **집계**뿐이라 누가 누구를 찍었는지는 끝까지 안 보인다.
   * 그게 익명이어야 하는 이유는 단순하다 — 누가 찍었는지 보이면 보복이 생기고,
   * 보복이 생기면 아무도 사실대로 안 찍는다.
   */
  harvest?: HarvestSettlement | null;

  /**
   * 표를 낸 사람들의 uid. **내용은 없고 누가 냈는지만 있다.**
   *
   * 홈 목록이 "아직 평가 안 한 플랜"에 배지를 달려면 내가 냈는지를 알아야
   * 하는데, 표 자체는 클라이언트가 못 읽는다. 그렇다고 플랜마다 서버를
   * 부르면 목록 하나에 API 호출이 여러 번 붙는다.
   *
   * 누가 냈는지가 보이는 건 감수한다. 진행 상황("3명 중 2명")이 이미 수를
   * 알려주고 있고, **무엇을 찍었는지는 여전히 안 보인다.** 그게 지켜야 할 선이다.
   */
  harvestVoters?: string[];

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ---------------------------------------------------------------- 수확
//
// 플랜이 끝난 뒤 서로 "제시간에 왔는지"를 묻는 단계. 계산은 lib/harvest.ts에
// 전부 순수 함수로 있고, 여기는 저장되는 모양만 적는다.

/** 평가 한 표. "안 옴"을 따로 둔 이유는 말없이 안 온 것이 지각보다 무겁기 때문이다. */
export type HarvestVote = "onTime" | "late" | "noShow";

/**
 * promises/{id}/harvest/{voterUid} 한 건 — 한 사람이 낸 표 묶음.
 *
 * 이 하위 컬렉션은 규칙에서 열어주지 않았다(맨 아래 `match /{document=**}`가
 * 전부 막는다). 그래서 별도 규칙 배포 없이 서버만 읽고 쓴다.
 */
export interface HarvestBallot {
  voterUid: string;
  voterName: string;
  /** 평가 대상 uid → 표. 자기 자신은 들어가지 않는다. */
  votes: Record<string, HarvestVote>;
  /** ISO. 서버가 찍는다. */
  submittedAt: string;
}

/** 한 사람의 수확 결과. 누가 찍었는지는 없고 몇 표인지만 남는다. */
export interface HarvestResult {
  uid: string;
  name: string;
  onTime: number;
  late: number;
  noShow: number;
  poison: boolean;
  /** 당도 변화량. -0.5 / 0 / +0.3 */
  delta: number;
}

export interface HarvestSettlement {
  /** ISO */
  settledAt: string;
  results: HarvestResult[];
  /** 표를 낸 사람 수 */
  voted: number;
  /** 낼 수 있었던 사람 수 */
  eligible: number;
}

// ---------------------------------------------------------------- 사용자 사과
//
// users/{uid} — 당도와 독사과. 메모(users/{uid}/notes)와 같은 자리이고
// 같은 이유로 **읽기도 서버 API를 거친다**(users/ 규칙을 새로 배포하지 않으려고).

export interface PoisonApple {
  promiseId: string;
  /** 어느 약속에서 받았는지. 플랜이 지워져도 남도록 제목을 복사해 둔다. */
  title: string;
  /** ISO */
  at: string;
}

export interface UserApple {
  /** 지금 당도. 서버가 수확 때 계산해 저장한다 — 볼 때마다 다시 계산하면
   *  사람마다 다른 숫자를 본다. */
  brix: number;
  poisonApples: PoisonApple[];
  /** 수확을 마친 플랜 수. "몇 번 지켰나"를 보여줄 때 쓴다. */
  harvested: number;
  /** ISO */
  updatedAt?: string;
}

// ---------------------------------------------------------------- 날짜 맞추기

/** 이 날짜에 올 수 있는지. 억지로 이분법으로 만들지 않고 "애매"를 둔다. */
export type DateVote = "ok" | "maybe" | "no";

export interface DateOptionVote {
  uid: string;
  name: string;
  vote: DateVote;
}

/** 날짜 후보 한 건. */
export interface DateOption {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm". 시간까지는 아직 안 정한 후보면 빈 문자열. */
  time: string;
  byUid: string;
  byName: string;
  /** ISO 문자열. 서버가 찍는다. */
  createdAt: string;
  votes: DateOptionVote[];
}

/** 후보 하나의 표를 세어 놓은 것. 화면에서 순위를 매기는 데 쓴다. */
export interface DateTally {
  ok: number;
  maybe: number;
  no: number;
  /** 아직 아무 표도 안 낸 사람 수 */
  pending: number;
}

// ---------------------------------------------------------------- 장소 비교
//
// "다 같이 편한 곳"을 고르기 위한 값들. 핵심은 평균 하나로 정하지 않는 것이다 —
// 평균만 보면 한 사람이 크게 손해봐도 좋아 보인다. 그래서 제일 먼 사람(maxSec)과
// 편차(spreadSec)를 같이 들고 다닌다.

/** 어떤 장소 하나에 대한 참여자 전체의 이동시간 요약. */
export interface PlaceSummary {
  /** 평균 소요시간(초) */
  averageSec: number;
  /** 제일 오래 걸리는 사람의 소요시간(초) */
  maxSec: number;
  /** 제일 빠른 사람과 제일 느린 사람의 차이(초) */
  spreadSec: number;
  /** 계산에 들어간 사람 수 */
  counted: number;
  /** 출발지를 안 정해서 빠진 사람 수 */
  skipped: number;
}

/** 참여자 한 명이 그 장소까지 가는 데 걸리는 시간. */
export interface PlaceMemberTime {
  uid: string;
  name: string;
  originLabel: string;
  kind: "car" | "transit";
  durationSec: number;
  /** 지금 약속 장소 대비 차이(초). 양수면 더 오래 걸린다. 기준이 없으면 null */
  deltaSec: number | null;
}

/** 장소 하나를 계산한 결과. */
export interface PlaceCheck {
  place: { name: string; address: string; lat: number; lng: number };
  summary: PlaceSummary;
  members: PlaceMemberTime[];
  /** 출발지를 안 정해 계산에서 빠진 사람 이름 */
  skippedNames: string[];
}

/** 만든 사람에게 올라간 장소 제안 한 건. */
export interface PlaceSuggestion {
  id: string;
  place: { name: string; address: string; lat: number; lng: number };
  byUid: string;
  byName: string;
  /** ISO 문자열. 서버가 찍는다. */
  createdAt: string;
  /**
   * 제안한 시점의 집계값.
   *
   * 볼 때마다 다시 계산하지 않는다. 목록에 제안이 세 건 있으면 열 때마다
   * 참여자 수 × 3 만큼 외부 API를 부르게 되는데, ODsay가 하루 1천 건이라
   * 그걸 감당할 수 없다. 대신 값이 언제 것인지 화면에 밝힌다.
   */
  summary: PlaceSummary;
}

// ---------------------------------------------------------------- 참여자 상태
//
// promises/{id}/members/{uid} 한 건. 약속 문서와 따로 두는 이유:
//   1. 참여자가 자기 경로를 저장할 때마다 약속 문서를 건드리면, 그 문서를
//      보고 있는 모든 사람의 화면이 남의 경로 변경으로 계속 다시 그려진다.
//   2. 나중에 위치 공유로 갈 때 좌표가 초 단위로 바뀐다. 약속 문서에 넣으면
//      약속 하나가 통째로 쓰기 대상이 된다.

/** 확인 안 함 / 가는 중 / 도착. 자동 감지가 아니라 본인이 누른다. */
export type MemberStatus = "unknown" | "onway" | "arrived";

/** 참여자가 고른 경로. 지도에 다시 그릴 수 있을 만큼만 담는다. */
export interface MemberRoute {
  kind: "car" | "transit";
  /** 목록에 그대로 쓰는 한 줄. 예: "지하철", "버스+지하철" */
  label: string;
  durationSec: number;
  origin: { label: string; lat: number; lng: number };
  /** 대중교통 노선을 지도에 다시 그릴 때 필요한 열쇠. 자동차는 null */
  mapObj?: string | null;
  transfers?: number | null;
  fare?: number | null;
  firstStation?: string | null;
}

export interface PromiseMember {
  /** 문서 ID이기도 하다. uid의 ':'는 문서 ID에 쓸 수 있다. */
  uid: string;
  name: string;
  status: MemberStatus;
  route: MemberRoute | null;
  /**
   * 어디서 출발하는지. 경로와 따로 둔다.
   *
   * 경로(route)를 고르면 그 안에도 origin이 들어 있지만, 그건 "이 경로의
   * 출발지"라서 경로를 지우면 같이 사라진다. 장소를 비교하려면 경로를 아직
   * 안 고른 사람의 출발지도 필요해서 — 플랜에 들어오자마자 출발지만 정해두는
   * 흐름이 있다 — 별도 필드로 뺐다. 경로를 저장할 때도 여기를 같이 채운다.
   */
  origin?: { label: string; lat: number; lng: number } | null;
  /**
   * 이 경로로 늦지 않으려면 언제 나서야 하는지. 서버가 경로를 저장할 때
   * 같이 계산해 둔다 — 나중에 알림을 보낼 주체가 서버이기 때문이다.
   * ISO 문자열. 경로가 없거나 약속 시각을 모르면 null.
   */
  leaveAt: string | null;
  /**
   * "나는 오늘 몇 시까지 가요" — 본인이 적는 도착 예정 시각(ISO).
   *
   * 약속 시각(플랜 하나)과 따로 두는 이유: 6시 모임이어도 6시 퇴근이라
   * 6시 30분에 오는 사람이 있다. 그걸 약속 시각을 바꿔서 표현하면 정시에
   * 오는 사람까지 늦게 오게 된다. 약속 시각은 그대로 두고 "나는 이때 도착"만
   * 각자 얹는다. 방장·방원 구분 없이 누구나 적는다.
   *
   * 안 적었으면 null — "약속 시각에 맞춰 온다"는 뜻으로 읽는다.
   */
  arrivalAt?: string | null;
  /**
   * 이번 플랜에 갈 것인지. 방에서 나가는 것(leavePromise)과 다르다 —
   * 명단에는 그대로 남고 표시만 바뀐다. 마음이 바뀌면 되돌릴 수 있고,
   * 장소가 바뀌어서 갈 수 있게 되는 경우도 흔하다.
   *
   * 값이 없는 옛 문서는 전부 "간다"로 본다.
   */
  attendance?: MemberAttendance;
  /** 못 가는 이유. 안 적어도 된다 — 강제하면 그냥 아무 말이나 적는다. */
  absenceReason?: string | null;
  /**
   * 지금 정해진 장소가 나한테 무리라는 표시. 서버가 장소를 바꾸면 지운다.
   * (바뀐 장소에 대한 이의가 아니므로 그대로 두면 거짓말이 된다.)
   */
  placeObjection?: PlaceObjection | null;
  updatedAt?: Timestamp;
}

/** 이번 플랜에 갈지 말지. 방을 나가는 것과는 다른 축이다. */
export type MemberAttendance = "going" | "cant";

/** "이 장소면 가기 어려워요" 한 건. */
export interface PlaceObjection {
  /** 왜 어려운지. 빈 문자열이면 이유 없이 표시만 한 것이다. */
  reason: string;
  /**
   * 이의를 낼 때의 장소 이름. 장소가 바뀌면 서버가 이 이의를 지우지만,
   * 화면에서 "어디에 대한 말이었는지" 보여줄 때도 쓴다.
   */
  placeName: string;
  /** ISO. 서버가 찍는다. */
  at: string;
}

// ---------------------------------------------------------------- 달력 메모
//
// users/{uid}/notes/{id} 한 건. 나만 보는 것이라 플랜과 아예 다른 자리에 둔다.
//
// **읽기도 쓰기도 서버 API를 거친다.** 이 프로젝트는 읽기를 클라이언트가
// Firestore에서 직접 하는 게 기본인데(실시간 구독이 필요해서), 메모는 나만
// 바꾸므로 실시간일 이유가 없다. 서버로 돌리면 `users/` 보안 규칙을 새로
// 짜서 콘솔에 배포하지 않아도 된다 — 그건 사람이 직접 해야 하는 일이라
// 안 만들 수 있으면 안 만드는 게 낫다.

export interface CalendarNote {
  id: string;
  /** "YYYY-MM-DD" 현지 기준. 달력이 이 열쇠로 묶는다. */
  date: string;
  text: string;
  /**
   * 이 메모가 딸린 약속. 없으면 그날에만 딸린 메모다.
   *
   * 메모를 약속 안에 넣을 수 있게 한 이유: 적는 게 원래 귀찮은 일이라
   * 화면을 옮기게 하면 안 적는다. 약속을 보다가 그 자리에서 "챙길 것"을
   * 적는 게 제일 안 귀찮다. 약속이 없는 날에는 그날 메모로 남는다.
   *
   * 약속이 지워져도 메모는 남는다. 지우려면 별도 정리가 필요한데, 사용자가
   * 쓴 글을 남의 사정(약속 삭제)으로 지우는 건 과하다고 봤다.
   */
  promiseId?: string | null;
  /** 챙겼는지. 체크리스트로 쓰일 때만 의미가 있다. */
  done?: boolean;
  /** ISO. 서버가 찍는다. */
  createdAt: string;
}
