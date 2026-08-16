// ODsay 키가 제대로 들어갔는지 확인한다.
//
//   node --env-file=.env.local scripts/check-odsay.mjs
//
// 키 자체는 절대 찍지 않는다. 앞 4글자만 보여줘서 "뭔가 들어있다" 정도만 확인한다.

const KEY = process.env.ODSAY_API_KEY;

if (!KEY) {
  console.error("✗ ODSAY_API_KEY가 없습니다.");
  console.error("  .env.local 맨 아래에 ODSAY_API_KEY=받은키 를 넣고 다시 실행하세요.");
  process.exit(1);
}

console.log(`키 확인 · ${KEY.slice(0, 4)}… (${KEY.length}자)\n`);

// 서울 안 / 서울↔지방 두 가지를 시험한다.
// 앱에서 실제로 겪을 두 경우(도시내·도시간)를 다 건드려 보기 위함.
const CASES = [
  { name: "서울 안 · 성수역 → 강남역", sx: 127.0557, sy: 37.5446, ex: 127.0276, ey: 37.4979 },
  { name: "지방 · 서울역 → 부산역", sx: 126.9707, sy: 37.5547, ex: 129.0417, ey: 35.1151 },
  { name: "지방 · 서울역 → 대전역", sx: 126.9707, sy: 37.5547, ex: 127.4348, ey: 36.3315 },
];

const MODE = { 1: "지하철", 2: "버스", 3: "버스+지하철" };

async function call({ sx, sy, ex, ey }, searchType) {
  const p = new URLSearchParams({
    SX: String(sx),
    SY: String(sy),
    EX: String(ex),
    EY: String(ey),
    OPT: "0",
    SearchType: String(searchType),
    apiKey: KEY,
  });

  const res = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p}`);
  const data = await res.json();

  if (data.error) {
    const e = Array.isArray(data.error) ? data.error[0] : data.error;
    return { error: `${e.code ?? ""} ${e.msg ?? ""}`.trim() };
  }
  return {
    paths: data.result?.path ?? [],
    needsIntercity: data.result?.outTrafficCheck === 1,
  };
}

let failed = 0;

for (const c of CASES) {
  // 앱과 같은 순서로 시도한다: 거리로 찍고, 아니면 반대쪽.
  const far =
    Math.hypot((c.ex - c.sx) * 88_000, (c.ey - c.sy) * 111_000) > 40_000;
  const first = far ? 1 : 0;

  let r = await call(c, first);
  let used = first;

  if (r.error || !r.paths?.length || r.needsIntercity) {
    used = first === 0 ? 1 : 0;
    r = await call(c, used);
  }

  if (r.error || !r.paths?.length) {
    console.log(`✗ ${c.name}\n   ${r.error ?? "경로 없음"}\n`);
    failed += 1;
    continue;
  }

  const best = [...r.paths].sort((a, b) => a.info.totalTime - b.info.totalTime)[0];
  const modes = [...new Set(r.paths.map((p) => MODE[p.pathType] ?? "기타"))];

  console.log(`✓ ${c.name}  (SearchType=${used})`);
  console.log(
    `   ${MODE[best.pathType] ?? "대중교통"} ${best.info.totalTime}분 · ` +
      `환승 ${(best.info.busTransitCount ?? 0) + (best.info.subwayTransitCount ?? 0)}회 · ` +
      `${(best.info.payment ?? 0).toLocaleString("ko-KR")}원`
  );
  console.log(`   후보 ${r.paths.length}개 · 방식 ${modes.join(", ")}\n`);
}

if (failed > 0) {
  console.log(`${CASES.length}개 중 ${failed}개 실패.`);
  process.exit(1);
}
console.log("전부 정상입니다.");
