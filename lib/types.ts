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
