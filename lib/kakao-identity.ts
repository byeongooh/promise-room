import { badRequest, forbidden, unauthorized, ApiError } from "@/lib/api-guard";
import { toCanonicalUid } from "@/lib/uid";

// 카카오 액세스 토큰으로 "이 사람이 누구인지"를 확인한다.
//
// **웹앱에는 없던 길이다.** 웹은 NextAuth가 카카오와 직접 주고받고 세션 쿠키를
// 만들어주는데, 앱(React Native)에는 그 쿠키가 없다. 앱은 카카오 SDK로 직접
// 로그인해서 액세스 토큰을 손에 쥐고 오므로, 서버가 그 토큰을 카카오에 물어봐서
// 신원을 확인하는 창구가 따로 필요하다.
//
// 확인이 끝나면 웹과 **똑같은 uid**("kakao:<숫자>")가 나온다. 그래서 앱과 웹이
// 같은 계정, 같은 플랜을 본다. uid를 만드는 곳은 여전히 lib/uid.ts 하나다.

const KAPI = "https://kapi.kakao.com";

/** 카카오가 응답을 안 주고 매달리면 요청 하나가 통째로 붙잡힌다. */
const TIMEOUT_MS = 5_000;

export interface KakaoIdentity {
  /** "kakao:<숫자>" — 웹 로그인과 완전히 같은 형식 */
  uid: string;
  /** 카카오 닉네임. 못 가져오면 null */
  name: string | null;
}

interface TokenInfo {
  id: number;
  expires_in: number;
  app_id: number;
}

async function kapi<T>(path: string, accessToken: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${KAPI}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(502, "KAKAO_UNREACHABLE", "카카오에 연결하지 못했습니다.");
  }

  // 카카오는 ODsay와 달리 HTTP 상태 코드를 제대로 쓴다. 잘못된 토큰이면
  // 401에 {"msg":"this access token does not exist","code":-401}이 온다.
  // (2026-08-22에 실제로 불러서 확인함.)
  if (res.status === 401) throw unauthorized();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[kakao-identity] ${path} ${res.status}: ${body.slice(0, 200)}`);
    throw new ApiError(502, "KAKAO_ERROR", "카카오에서 사용자 정보를 받지 못했습니다.");
  }

  return (await res.json()) as T;
}

/**
 * 앱이 보내온 카카오 액세스 토큰을 검증하고 신원을 돌려준다.
 *
 * **반드시 카카오에 직접 물어본다.** 앱이 보낸 uid를 그대로 믿으면 아무나
 * 남의 uid를 적어 보내 그 사람 행세를 할 수 있다. 앱은 사용자 손 안에 있어서
 * 무엇이든 고쳐 보낼 수 있는 물건이라, 신원은 서버가 스스로 확인해야 한다.
 */
export async function verifyKakaoAccessToken(accessToken: string): Promise<KakaoIdentity> {
  const token = accessToken.trim();
  if (!token) throw badRequest("카카오 액세스 토큰이 없습니다.");

  const expectedAppId = readAppId();

  // 1) 토큰이 살아 있는지 + **우리 앱의 토큰이 맞는지**
  const info = await kapi<TokenInfo>("/v1/user/access_token_info", token);

  // 이 검사가 이 파일에서 제일 중요하다.
  //
  // 없으면 이런 공격이 열린다 — 남이 자기 카카오 앱을 하나 만들고("무료 쿠폰"
  // 같은 것), 거기 로그인한 사람들의 액세스 토큰을 모아서 우리 서버에 들이민다.
  // 우리가 app_id를 안 보면 그 토큰도 "유효한 카카오 토큰"이라 통과한다.
  //
  // 카카오 회원번호가 앱마다 다른 값인지 아닌지에 기대지 않는다. 다르면 없는
  // 계정이 만들어지고 같으면 계정 탈취인데, **어느 쪽인지 확인하지 못했으므로**
  // 확인이 필요 없게 만드는 쪽을 택했다. 다른 앱의 토큰은 여기서 끝난다.
  if (info.app_id !== expectedAppId) {
    console.error(
      `[kakao-identity] 다른 앱의 토큰 — 받은 app_id=${info.app_id}, 기대=${expectedAppId}`
    );
    throw forbidden("이 앱에서 발급된 로그인이 아닙니다.");
  }

  const uid = toCanonicalUid(String(info.id));
  if (!uid) throw unauthorized();

  // 2) 표시 이름. 실패해도 로그인 자체는 막지 않는다 — 이름은 있으면 좋은
  //    것이지 신원의 근거가 아니다. 신원은 위에서 이미 정해졌다.
  let name: string | null = null;
  try {
    const me = await kapi<{ kakao_account?: { profile?: { nickname?: string } } }>(
      "/v2/user/me",
      token
    );
    name = me.kakao_account?.profile?.nickname?.trim() || null;
  } catch {
    console.warn("[kakao-identity] 닉네임을 가져오지 못함 — 이름 없이 진행");
  }

  return { uid, name };
}

/**
 * 카카오 앱 ID(숫자). REST API 키(`KAKAO_CLIENT_ID`)와 **다른 값**이다.
 * 카카오 개발자 → 내 애플리케이션 → 앱 설정 → 요약 정보의 "앱 ID".
 *
 * 없으면 막고 시작한다. 이건 보안 검사라, 설정이 빠졌을 때 조용히 건너뛰면
 * 검사를 안 하느니만 못하다(하는 줄 알고 안심하게 된다).
 */
function readAppId(): number {
  const raw = process.env.KAKAO_APP_ID?.trim();
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) {
    throw new ApiError(
      500,
      "KAKAO_APP_ID_MISSING",
      "서버에 KAKAO_APP_ID가 설정되지 않았습니다."
    );
  }
  return n;
}
