// 앱 아이콘을 apple-shape.ts에서 뽑아낸다.
//
//   node scripts/build-icon.mjs
//
// **아이콘을 손으로 그리지 않는 이유.**
// 사과 모양은 lib/apple-shape.ts 한 곳에만 있고 워드마크·탭바·게이지가 그걸
// 공유한다. 그런데 앱 아이콘만 별도 PNG로 손으로 그려두면, 나중에 로고를
// 고칠 때 아이콘만 옛 모양으로 남는다. 전에 세 파일이 같은 path를 각자
// 복사해 들고 있어서 겪었던 문제가, 이번엔 코드 밖에서 똑같이 재발한다.
// 그래서 아이콘도 같은 path에서 만든다.
//
// TypeScript를 그대로 import할 수 없어서 소스를 읽어 상수만 꺼낸다.
// 못 찾으면 조용히 넘어가지 않고 멈춘다 — 틀린 아이콘이 나오는 것보다
// 스크립트가 서는 편이 낫다.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- 모양 읽기

const SHAPE_SRC = join(ROOT, "lib", "apple-shape.ts");
const src = readFileSync(SHAPE_SRC, "utf8");

function constant(name) {
  const m = src.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`));
  if (!m) {
    throw new Error(
      `lib/apple-shape.ts에서 ${name}을 찾지 못했습니다.\n` +
        `상수 이름이나 형식이 바뀌었다면 이 스크립트도 같이 고쳐야 합니다 — ` +
        `아이콘이 옛 모양으로 남는 것을 막으려고 일부러 여기서 멈춥니다.`
    );
  }
  return m[1];
}

const APPLE_BODY = constant("APPLE_BODY");
const APPLE_STEM = constant("APPLE_STEM");

/** APPLE_SHINE은 문자열이 아니라 객체라 따로 읽는다. 자리는 앱과 같아야 한다. */
function shineConst() {
  const m = src.match(/export const APPLE_SHINE = \{([^}]+)\}/);
  if (!m) {
    throw new Error(
      "lib/apple-shape.ts에서 APPLE_SHINE을 찾지 못했습니다. 형식이 바뀌었다면 여기도 같이 고쳐야 합니다."
    );
  }
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+)\s*:\s*(-?[\d.]+)/g)) out[k] = Number(v);
  return out;
}

const APPLE_SHINE = shineConst();

// ---------------------------------------------------------------- 색

// 아이콘 배경. 앱 안에서 쓰는 중립 회색(--tk-ground)보다 반 톤 따뜻하다.
// 홈 화면에는 흰 아이콘이 널려 있어서, 순백으로 두면 그 무리에 묻힌다.
const CREAM = "#FAF6EF";
const RED = "#B2322A"; // --ap-red (라이트)
const LEAF = "#4A8058"; // --ap-leaf (라이트)

// 어두운 배경용. 앱의 다크 토큰과 같은 값이다.
const INK = "#171717";
const RED_DARK = "#EE7C6E";
const LEAF_DARK = "#7EB68C";

// ---------------------------------------------------------------- 배치
//
// 캔버스를 100×100으로 두고 사과를 가운데 앉힌다. 실제 픽셀 크기는 마지막에
// 정한다 — 벡터라 어느 크기로 뽑든 같은 그림이다.
//
// **여백을 한 값으로 통일하면 안 된다.** 쓰이는 곳마다 잘리는 방식이 달라서다.
//
//   파비콘·웹   잘리지 않는다. 작아서 오히려 꽉 채워야 한다. 브라우저 탭이나
//               북마크 바에서 다른 아이콘들은 도형이 사각형을 거의 채우는데,
//               우리만 절반 크기면 그 줄에서 혼자 허전해 보인다.
//   iOS         모서리를 스퀴클로 깎는다. 꽉 채우면 어깨가 잘려 나간다.
//   안드로이드  런처가 원·사각·물방울로 오려내서 **바깥 33%가 날아갈 수 있다.**
//               가운데 66% 안에 다 들어와야 한다.
//
// 그래서 "글리프가 캔버스 세로의 몇 %를 차지할지"를 받아 배치를 계산한다.
// 숫자를 손으로 넣으면 셋 중 하나는 반드시 어긋난다.

/**
 * 사과 심볼(viewBox 100×112, 내용은 x 12.5~87.5 · y 16~101)을
 * 캔버스 세로의 pct%를 차지하도록 가운데 앉히는 상자를 구한다.
 */
function boxForGlyphHeight(pct) {
  const w = pct / 0.85; // 글리프 높이 = 심볼 폭 × (101-16)/112 = 0.85배
  const h = w * 1.12;
  const glyphW = 0.75 * w; // (87.5-12.5)/100
  const glyphH = 0.85 * w;
  return {
    x: (100 - glyphW) / 2 - 0.125 * w,
    y: (100 - glyphH) / 2 - (16 / 112) * h,
    w,
    h,
  };
}

const GLYPH = {
  web: 78, // 파비콘·웹 — 꽉 채운다
  ios: 70, // 스퀴클이 모서리를 깎으므로 조금 물러선다
  android: 60, // 가운데 66% 안. 이보다 키우면 꼭지부터 잘린다
};

// **꼭지 굵기는 파일 크기가 아니라 "보이는 크기"로 정한다.**
// 아이콘 파일은 1024px이지만 홈 화면에서는 60px로 산다. 그 크기에서 사과는
// 30px 남짓이라, apple-shape.ts의 stemWidth가 작은 사과에 주는 값을 쓴다.
// 1024px 기준으로 얇게 그리면 정작 홈 화면에서 꼭지가 실처럼 사라진다.
const STEM_W = 10;

// 광은 얹되, **앱 안의 광보다 크게** 얹는다.
//
// APPLE_SHINE(rx 7)은 게이지 안의 사과에 맞춘 크기다. 그 사과는 링 안에서
// 지름의 46%밖에 안 되는데, 아이콘 사과는 캔버스를 70~78% 채운다. 같은
// 타원을 그대로 얹으면 넓은 빨간 면에 점 하나 찍은 꼴이라 오히려 더 밋밋해
// 보인다. 자리(cx·cy·각도)는 앱과 똑같이 두고 크기만 키운다.
const SHINE_SCALE = 2.2;

/**
 * 광을 **가장자리가 풀린 그라데이션**으로 그린다.
 *
 * 앱 안에서는 흰 타원을 30% 불투명도로 그냥 얹는다. 그 사과는 작아서 그걸로
 * 충분한데, 아이콘처럼 사과가 커지면 같은 방식이 "빛"이 아니라 **분홍색
 * 스티커를 붙인 것**처럼 보인다. 실제로 한 번 그렇게 나왔다.
 *
 * 빛은 경계가 없다. 가운데서 밝고 바깥으로 갈수록 사라져야 광으로 읽힌다.
 * 앱 UI에는 그라데이션을 쓰지 않지만 아이콘은 매체가 다르다 — 홈 화면의
 * 다른 아이콘들도 대부분 이렇게 입체감을 준다.
 */
function glossSvg(strength = 1) {
  const s = APPLE_SHINE;
  const a = (v) => (v * strength).toFixed(3);
  return `<defs>
    <radialGradient id="gloss" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="${a(0.46)}"/>
      <stop offset="45%" stop-color="#fff" stop-opacity="${a(0.24)}"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${s.cx}" cy="${s.cy}" rx="${(s.rx * SHINE_SCALE).toFixed(1)}" ry="${(s.ry * SHINE_SCALE).toFixed(1)}" transform="rotate(${s.rotate} ${s.cx} ${s.cy})" fill="url(#gloss)"/>`;
}

function appleSvg({ bg, apple, stem, size, glyph, shine = true, glossStrength = 1, transparentBg = false }) {
  const box = boxForGlyphHeight(glyph);
  const back = transparentBg ? "" : `<rect width="100" height="100" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
${back}
  <g transform="translate(${box.x.toFixed(2)} ${box.y.toFixed(2)}) scale(${(box.w / 100).toFixed(4)})">
    <path d="${APPLE_BODY}" fill="${apple}"/>
    ${shine ? glossSvg(glossStrength) : ""}
    <path d="${APPLE_STEM}" fill="none" stroke="${stem}" stroke-width="${STEM_W}" stroke-linecap="round"/>
  </g>
</svg>`;
}

/** 안드로이드 adaptive icon의 앞면. 배경 없이 사과만, 잘리는 33% 밖으로 안 나가게. */
function foregroundSvg(size, apple, stem) {
  return appleSvg({ bg: "", apple, stem, size, glyph: GLYPH.android, transparentBg: true });
}

// ---------------------------------------------------------------- 내보내기

const OUT = join(ROOT, "public", "brand");
mkdirSync(OUT, { recursive: true });

const targets = [
  // 스토어·앱 본체. iOS는 투명을 허용하지 않아 배경을 반드시 채운다.
  { file: "icon-1024.png", size: 1024, svg: () => appleSvg({ bg: CREAM, apple: RED, stem: LEAF, size: 1024, glyph: GLYPH.ios }) },
  { file: "icon-dark-1024.png", size: 1024, svg: () => appleSvg({ bg: INK, apple: RED_DARK, stem: LEAF_DARK, size: 1024, glyph: GLYPH.ios, glossStrength: 0.5 }) },
  // 안드로이드 adaptive icon — 앞/뒤를 나눠야 런처가 제 모양으로 오려낸다.
  { file: "adaptive-foreground.png", size: 432, svg: () => foregroundSvg(432, RED, LEAF) },
  { file: "adaptive-background.png", size: 432, svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432"><rect width="432" height="432" fill="${CREAM}"/></svg>` },
];

// Next.js 규약 파일. app/icon.png과 app/apple-icon.png을 두면 웹앱 파비콘과
// iOS 홈 화면 바로가기 아이콘이 자동으로 붙는다. 지금은 파비콘이 아예 없다.
const nextTargets = [
  // 브라우저 탭·북마크 바. 잘리지 않으니 꽉 채운다.
  { path: join(ROOT, "app", "icon.png"), size: 512, glyph: GLYPH.web },
  // iOS 홈 화면 바로가기. 여기는 모서리가 깎이므로 조금 물러선다.
  { path: join(ROOT, "app", "apple-icon.png"), size: 180, glyph: GLYPH.ios },
];

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  sharp = null;
}

// SVG는 항상 남긴다. 벡터가 원본이고 PNG는 거기서 뽑은 것이다.
const masterSvg = appleSvg({ bg: CREAM, apple: RED, stem: LEAF, size: 1024, glyph: GLYPH.ios });
writeFileSync(join(OUT, "icon.svg"), masterSvg);
console.log("✓ public/brand/icon.svg");

if (!sharp) {
  console.log("\n! sharp가 없어 PNG는 만들지 않았습니다. `npm i -D sharp` 후 다시 실행하세요.");
  process.exit(0);
}

for (const t of targets) {
  await sharp(Buffer.from(t.svg())).png().toFile(join(OUT, t.file));
  console.log(`✓ public/brand/${t.file}  (${t.size}px)`);
}

for (const t of nextTargets) {
  await sharp(
    Buffer.from(appleSvg({ bg: CREAM, apple: RED, stem: LEAF, size: t.size, glyph: t.glyph }))
  )
    .png()
    .toFile(t.path);
  console.log(`✓ ${t.path.replace(ROOT + "\\", "").replace(ROOT + "/", "")}  (${t.size}px)`);
}

// 탭 아이콘은 SVG도 같이 둔다.
//
// 512px PNG를 16px로 줄이면 브라우저가 알아서 깎는데, 그 과정에서 꼭지처럼
// 가는 선이 뭉갠다. SVG는 어느 크기에서든 그 크기로 다시 그려서 또렷하다.
// Next.js가 두 개를 모두 <link>로 걸고, 요즘 브라우저는 SVG를 먼저 고른다.
writeFileSync(
  join(ROOT, "app", "icon.svg"),
  appleSvg({ bg: CREAM, apple: RED, stem: LEAF, size: 512, glyph: GLYPH.web })
);
console.log("✓ app/icon.svg  (탭에서 어느 크기든 또렷하게)");

console.log(`
다음에 할 것
  · iOS      : icon-1024.png 를 그대로 올린다. 모서리는 iOS가 깎으므로 직접 깎지 말 것.
  · Android  : adaptive-foreground / adaptive-background 두 장을 쌍으로 등록한다.
  · 웹       : app/icon.png · app/apple-icon.png 는 Next.js가 알아서 붙인다.
`);
