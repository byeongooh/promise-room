import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// 관리자 비밀번호 해시.
// Next.js에 의존하지 않아 해시 생성 스크립트에서도 그대로 쓸 수 있다.

const N = 16384;
const r = 8;
const p = 1;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// 환경변수에 넣는 값이라 형식에 제약이 있다.
// $ 를 구분자로 쓰면 Next.js가 .env 를 읽을 때 $N 같은 걸 변수로 치환해
// 해시가 깨진다. 그래서 : 를 쓰고 base64url(+, /, = 없음)로 인코딩한다.
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, 32, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${N}.${r}.${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

/** 입력한 비밀번호가 ADMIN_PASSWORD_HASH와 맞는지 확인한다. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored) return false;

  try {
    const parts = stored.trim().split(":");
    if (parts.length !== 4 || parts[0] !== "scrypt") return false;

    const [pn, pr, pp] = parts[1].split(".").map(Number);
    const salt = Buffer.from(parts[2], "base64url");
    const expected = Buffer.from(parts[3], "base64url");

    const actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: pn || N,
      r: pr || r,
      p: pp || p,
      maxmem: 64 * 1024 * 1024,
    });

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
