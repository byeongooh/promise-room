import type { Timestamp } from "firebase/firestore";

export interface PromiseData {
  id?: string;
  title: string;
  date: string | Timestamp;
  time: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  locationPlaceId?: string | null;
  /** 지각 벌칙(자유 텍스트) — 독사과로 대체하면서 새로 만들지 않는다.
   *  옛 플랜에 남아 있는 값을 읽지 못해 오류가 나지 않도록 타입만 남긴다. */
  penalty?: string;
  status?: string;
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

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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
  updatedAt?: Timestamp;
}
