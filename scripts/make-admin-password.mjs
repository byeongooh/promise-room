// 관리자 비밀번호 해시를 만든다.
//
//   node scripts/make-admin-password.mjs
//
// 비밀번호를 입력하면 해시가 출력된다. 그 값을 .env.local 과 Vercel 환경변수의
// ADMIN_PASSWORD_HASH 에 넣으면 된다.
// 평문 비밀번호는 어디에도 저장되지 않는다.

import readline from "node:readline";
import { hashAdminPassword } from "../lib/admin-password.ts";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// 입력 중 화면에 비밀번호가 찍히지 않게 가린다
const origWrite = rl._writeToOutput?.bind(rl);
let hiding = false;
rl._writeToOutput = function (s) {
  if (hiding && !s.includes("관리자 비밀번호")) {
    rl.output.write("*");
    return;
  }
  origWrite?.(s);
};

rl.question("관리자 비밀번호를 입력하세요: ", async (pw) => {
  hiding = false;
  rl.close();
  console.log("");

  const trimmed = pw.trim();
  if (trimmed.length < 8) {
    console.error("8자 이상으로 정해주세요. 이 비밀번호 하나로 모든 약속을 볼 수 있습니다.");
    process.exit(1);
  }

  const hash = await hashAdminPassword(trimmed);
  console.log("아래 한 줄을 .env.local 에 추가하고, Vercel 환경변수에도 같은 값을 넣으세요.\n");
  console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
  console.log("평문 비밀번호는 저장되지 않습니다. 잊어버리면 다시 만들어야 합니다.");
  process.exit(0);
});
hiding = true;
