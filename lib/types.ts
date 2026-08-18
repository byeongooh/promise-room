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
  penalty: string;
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

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
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
   * 이 경로로 늦지 않으려면 언제 나서야 하는지. 서버가 경로를 저장할 때
   * 같이 계산해 둔다 — 나중에 알림을 보낼 주체가 서버이기 때문이다.
   * ISO 문자열. 경로가 없거나 약속 시각을 모르면 null.
   */
  leaveAt: string | null;
  updatedAt?: Timestamp;
}
