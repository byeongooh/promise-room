import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// 약속 비밀번호는 해시로만 저장한다.
//
// 해시는 절대 약속 문서에 넣지 않는다 — Firestore 보안 규칙은 필드 단위로
// 가릴 수 없어서, 문서를 읽을 수 있는 사람은 그 안의 해시도 같이 읽는다.
// 짧은 비밀번호의 해시는 오프라인에서 즉시 뚫리므로, 해시는 서버(Admin SDK)만
// 접근 가능한 promises/{id}/private/auth 에 따로 저장한다.
//
// scrypt는 node 내장이라 새 의존성이 없고 Vercel에서 네이티브 빌드 이슈도 없다.

// promisify(scrypt)는 옵션 인자를 받는 오버로드를 잃어버려서 직접 감싼다.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const N = 16384;
const r = 8;
const p = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

/** 새로 만드는 약속 비밀번호의 최소 길이. */
export const MIN_PASSWORD_LENGTH = 6;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // maxmem 기본값은 N=16384에 부족해서 명시적으로 올려준다.
  return (await scryptAsync(password.normalize("NFKC"), salt, KEY_LEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  }));
}

/** "scrypt$N=..,r=..,p=..$<salt b64>$<hash b64>" 형식 문자열을 만든다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await derive(password, salt);
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** 저장된 해시와 입력 비밀번호를 상수 시간으로 비교한다. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt") return false;

    const params = Object.fromEntries(
      parts[1].split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k, Number(v)];
      })
    );

    const salt = Buffer.from(parts[2], "base64");
    const expected = Buffer.from(parts[3], "base64");

    const actual = (await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: params.N ?? N,
      r: params.r ?? r,
      p: params.p ?? p,
      maxmem: 64 * 1024 * 1024,
    }));

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 저장된 값이 이 모듈이 만든 해시 형식인지 (아니면 레거시 평문인지) 판별한다. */
export function isHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}
