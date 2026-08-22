// 앱 로그인 점검 — 카카오 액세스 토큰 하나로 전체 사슬을 밟아본다.
//
//   사용법:  node scripts/check-kakao-native.mjs <카카오 액세스 토큰> [서버주소]
//   예:      node scripts/check-kakao-native.mjs abc123...
//            node scripts/check-kakao-native.mjs abc123... https://applan.vercel.app
//
// 토큰은 React Native 앱에서 카카오 SDK로 로그인하면 손에 들어온다.
// (앱을 아직 안 만들었으면 카카오 개발자 콘솔의 REST API 테스트 도구로도 받을 수 있다.)
//
// **KAKAO_APP_ID를 모를 때 이 스크립트가 알려준다.** 카카오 콘솔을 안 뒤져도
// 1단계에서 그대로 찍힌다. 그 값을 .env.local과 Vercel에 넣으면 된다.
//
// 토큰은 비밀이라 앞 6자만 찍는다. 결과를 그대로 공유해도 된다.

const token = process.argv[2];
const base = (process.argv[3] || "http://localhost:3000").replace(/\/$/, "");

if (!token) {
  console.error("카카오 액세스 토큰을 인자로 주세요.");
  console.error("  node scripts/check-kakao-native.mjs <토큰> [서버주소]");
  process.exit(1);
}

const mask = (s) => `${String(s).slice(0, 6)}… (길이 ${String(s).length})`;
const line = () => console.log("─".repeat(58));

console.log(`\n토큰: ${mask(token)}`);
console.log(`서버: ${base}\n`);

// ---------------------------------------------------------------- 1
line();
console.log("1. 카카오에 토큰을 물어본다 (여기서 app_id를 알 수 있다)");
line();

const infoRes = await fetch("https://kapi.kakao.com/v1/user/access_token_info", {
  headers: { Authorization: `Bearer ${token}` },
});
const info = await infoRes.json().catch(() => ({}));

if (!infoRes.ok) {
  console.error(`  ✗ HTTP ${infoRes.status}`, info);
  console.error("\n  토큰이 만료됐거나 잘못됐습니다. 앱에서 다시 로그인해 새 토큰을 받으세요.");
  process.exit(1);
}

console.log(`  ✓ 회원번호  : ${info.id}`);
console.log(`  ✓ 남은 시간 : ${info.expires_in}초`);
console.log(`  ✓ 앱 ID     : ${info.app_id}   ← 이 값이 KAKAO_APP_ID 입니다`);
console.log(`\n  → uid는 "kakao:${info.id}" 가 됩니다.`);

// ---------------------------------------------------------------- 2
line();
console.log("2. 우리 서버에 토큰을 보낸다");
line();

const res = await fetch(`${base}/api/native/kakao`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ accessToken: token }),
});
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`  ✗ HTTP ${res.status}`, body);
  if (body.error === "KAKAO_APP_ID_MISSING") {
    console.error(`\n  서버에 KAKAO_APP_ID가 없습니다. 위 1번의 앱 ID(${info.app_id})를`);
    console.error("  .env.local에 넣고 개발 서버를 다시 띄우세요:");
    console.error(`\n    KAKAO_APP_ID=${info.app_id}\n`);
  } else if (body.error === "FORBIDDEN") {
    console.error(`\n  서버의 KAKAO_APP_ID가 이 토큰의 앱 ID(${info.app_id})와 다릅니다.`);
    console.error("  둘을 맞추세요. (다른 앱 토큰을 막는 검사가 제대로 도는 것이기도 합니다.)");
  }
  process.exit(1);
}

console.log(`  ✓ uid   : ${body.uid}`);
console.log(`  ✓ 이름  : ${body.name ?? "(없음)"}`);
console.log(`  ✓ 토큰  : ${mask(body.token)}`);

if (body.uid !== `kakao:${info.id}`) {
  console.error(`\n  ✗ uid가 어긋납니다. 기대 "kakao:${info.id}", 받음 "${body.uid}"`);
  process.exit(1);
}

// ---------------------------------------------------------------- 3
line();
console.log("3. 다음 단계 (앱에서 할 일)");
line();
console.log(`
  받은 커스텀 토큰으로 Firebase에 로그인하면 끝입니다.

    import { signInWithCustomToken, getAuth } from "firebase/auth";

    const { token } = await (await fetch(BASE + "/api/native/kakao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: kakaoAccessToken }),
    })).json();

    const cred = await signInWithCustomToken(getAuth(), token);
    const idToken = await cred.user.getIdToken();

  그 다음부터는 기존 API를 그대로 부르면 됩니다:

    fetch(BASE + "/api/promises", {
      headers: { Authorization: "Bearer " + idToken },
    });

  ID 토큰은 1시간마다 만료되므로 getIdToken()을 매번 부르세요 —
  Firebase SDK가 알아서 갱신해 줍니다.
`);

console.log("전부 통과했습니다.\n");
