import type { PromiseData } from "@/lib/types";

// 어떻게 만나는가 — 직접 만나기 / 온라인.
//
// 이 구분이 화면 절반을 좌우한다. 온라인 플랜에는 이동시간이라는 개념 자체가
// 없어서 출발지·경로·나가야 하는 시각·장소 비교가 통째로 의미를 잃는다.
// 그걸 화면마다 각자 판단하면 어긋나므로 여기 한 곳에서 정한다.

export type MeetingMode = "inPerson" | "online";

/**
 * 이 플랜을 어떻게 만나는지.
 *
 * 값이 없는 옛 플랜은 전부 직접 만남이다 — 온라인이라는 선택지가 생기기 전에
 * 만들어진 것들이라 다르게 볼 근거가 없다.
 */
export function meetingModeOf(promise: Pick<PromiseData, "meetingMode">): MeetingMode {
  return promise.meetingMode === "online" ? "online" : "inPerson";
}

export function isOnline(promise: Pick<PromiseData, "meetingMode">): boolean {
  return meetingModeOf(promise) === "online";
}

/**
 * 들어갈 링크가 안전한지.
 *
 * 링크는 참여자가 입력한 값이고 화면에서 누를 수 있게 그린다. javascript: 나
 * data: 같은 것을 그대로 <a href>에 넣으면 누른 사람의 브라우저에서 코드가
 * 돈다. http(s)만 통과시킨다.
 */
export function safeMeetingUrl(raw?: string | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * 링크만 보고 무슨 서비스인지 알아낸다. 못 알아보면 도메인을 그대로 쓴다.
 * 화면에 "Zoom" 한 줄이 있는 것과 긴 URL만 있는 것은 알아보는 속도가 다르다.
 */
export function meetingServiceName(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "링크";
  }

  const table: [string, string][] = [
    ["zoom.us", "Zoom"],
    ["zoom.com", "Zoom"],
    ["discord.gg", "디스코드"],
    ["discord.com", "디스코드"],
    ["meet.google.com", "구글 미트"],
    ["teams.microsoft.com", "팀즈"],
    ["teams.live.com", "팀즈"],
    ["gather.town", "게더타운"],
    ["whereby.com", "Whereby"],
    ["webex.com", "Webex"],
    ["kakao.com", "카카오"],
  ];

  for (const [needle, name] of table) {
    if (host === needle || host.endsWith(`.${needle}`)) return name;
  }
  return host;
}

/** 화면에 보여줄 "어디서" 한 줄. 온라인이면 서비스 이름, 아니면 장소. */
export function displayWhere(
  promise: Pick<PromiseData, "meetingMode" | "meetingUrl" | "location">
): string {
  if (isOnline(promise)) {
    const url = safeMeetingUrl(promise.meetingUrl);
    return url ? meetingServiceName(url) : "링크 정하는 중";
  }
  const v = (promise.location ?? "").trim();
  return v === "" ? "장소 정하는 중" : v;
}
