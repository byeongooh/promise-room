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
  password: string;
  status?: string;

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
