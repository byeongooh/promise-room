// ODsay 키가 제대로 들어갔는지 확인한다.
//
//   node --env-file=.env.local scripts/check-odsay.mjs
//
// 키 자체는 절대 찍지 않는다. 앞 4글자만 보여줘서 "뭔가 들어있다" 정도만 확인한다.

const KEY = process.env.ODSAY_API_KEY;

// ODsay에 URI 방식으로 등록했다면 어느 사이트에서 부르는지를 Referer로 본다.
// 서버에서 부르는 요청에는 Referer가 없으므로 직접 붙인다.
const REFERER = process.env.ODSAY_REGISTERED_URI ?? "https://promise-room.vercel.app";

if (!KEY) {
  console.error("✗ ODSAY_API_KEY가 없습니다.");
  console.error("  .env.local 맨 아래에 ODSAY_API_KEY=받은키 를 넣고 다시 실행하세요.");
  process.exit(1);
}

console.log(`키 확인 · ${KEY.slice(0, 4)}… (${KEY.length}자)`);
console.log(`Referer  · ${REFERER}\n`);

// 서울 안 / 서울↔지방 두 가지를 시험한다.
// 앱에서 실제로 겪을 두 경우(도시내·도시간)를 다 건드려 보기 위함.
const CASES = [
  { name: "서울 안 · 성수역 → 강남역", sx: 127.0557, sy: 37.5446, ex: 127.0276, ey: 37.4979 },
  { name: "지방 · 서울역 → 부산역", sx: 126.9707, sy: 37.5547, ex: 129.0417, ey: 35.1151 },
  { name: "지방 · 서울역 → 대전역", sx: 126.9707, sy: 37.5547, ex: 127.4348, ey: 36.3315 },
];

// lib/transit.ts와 같은 규칙. 도보(3)는 이름에서 빼고, 항공·해운은 아예 제외한다.
const TRAFFIC = { 1: "지하철", 2: "버스", 4: "기차", 5: "고속버스", 6: "시외버스", 7: "항공", 8: "해운" };
const EXCLUDED = new Set([7, 8]);

function describe(path) {
  const types = [...new Set((path.subPath ?? []).map((s) => s.trafficType).filter((t) => t && t !== 3))];
  if (types.some((t) => EXCLUDED.has(t))) return null;
  const info = path.info;
  const fare = info.payment ?? info.totalPayment ?? 0;
  const transfers =
    info.busTransitCount !== undefined || info.subwayTransitCount !== undefined
      ? (info.busTransitCount ?? 0) + (info.subwayTransitCount ?? 0)
      : Math.max(0, (info.transitCount ?? 1) - 1);
  return {
    mode: types.map((t) => TRAFFIC[t]).filter(Boolean).join("+") || "대중교통",
    min: info.totalTime,
    transfers,
    fare,
  };
}

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

  // 앱과 똑같이 Referer를 붙여 보낸다 (URI 방식으로 등록한 경우 필요).
  const res = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${p}`, {
    headers: { Referer: REFERER },
  });
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

  const options = r.paths
    .map(describe)
    .filter(Boolean)
    .sort((a, b) => a.min - b.min);

  if (options.length === 0) {
    console.log(`✗ ${c.name}\n   쓸 수 있는 경로 없음 (항공·해운만 나옴)\n`);
    failed += 1;
    continue;
  }

  // 앱과 같게: 같은 방식은 제일 빠른 것만, 최대 3개.
  const bestPerMode = new Map();
  for (const o of options) if (!bestPerMode.has(o.mode)) bestPerMode.set(o.mode, o);
  const shown = [...bestPerMode.values()].slice(0, 3);

  console.log(`✓ ${c.name}  (SearchType=${used}, 후보 ${r.paths.length}개)`);
  for (const o of shown) {
    console.log(
      `   ${o.mode} ${o.min}분 · 환승 ${o.transfers}회` +
        (o.fare > 0 ? ` · ${o.fare.toLocaleString("ko-KR")}원` : "")
    );
  }
  console.log();
}

if (failed > 0) {
  console.log(`${CASES.length}개 중 ${failed}개 실패.`);
  process.exit(1);
}
console.log("전부 정상입니다.");
