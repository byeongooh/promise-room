// 배포된 Firestore 보안 규칙을 실제로 통과시켜 검증한다.
//
//   node scripts/verify-rules.mjs
//
// Admin SDK는 규칙을 우회하므로 검증에 쓸 수 없다. 그래서 Admin으로는
// 커스텀 토큰만 발급하고, 실제 조회는 브라우저와 똑같은 클라이언트 SDK로 한다.
// 규칙을 고칠 때마다 이 스크립트를 다시 돌린다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  let v = line.slice(i + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[line.slice(0, i).trim()] = v;
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.split(String.fromCharCode(92, 110)).join("\n"),
  }),
});

const app = initializeApp({
  apiKey: "AIzaSyD1xPZLySlqSJOfsdgfqY-ZXuu4ZRaDceM",
  authDomain: "promise-room.firebaseapp.com",
  projectId: "promise-room",
  appId: "1:790788861101:web:e6d43c8bd86450f1cfaa24",
});
const auth = getAuth(app);
const db = getFirestore(app);

const OWNER = "kakao:4746129449";
const OUTSIDER = "kakao:verify-outsider";

let pass = 0;
let fail = 0;

async function check(label, shouldSucceed, fn) {
  try {
    const result = await fn();
    if (shouldSucceed) {
      console.log(`  ✅ ${label}${result !== undefined ? ` (${result})` : ""}`);
      pass++;
    } else {
      console.log(`  ❌ ${label} — 차단돼야 하는데 통과함!`);
      fail++;
    }
  } catch (e) {
    const denied = String(e.code ?? e.message).includes("permission-denied");
    if (!shouldSucceed && denied) {
      console.log(`  ✅ ${label} (차단됨)`);
      pass++;
    } else if (!shouldSucceed) {
      console.log(`  ⚠️  ${label} — 차단은 됐으나 사유가 다름: ${e.code ?? e.message}`);
      fail++;
    } else {
      console.log(`  ❌ ${label} — 되어야 하는데 막힘: ${e.code ?? e.message}`);
      fail++;
    }
  }
}

async function signInAs(uid) {
  await signInWithCustomToken(auth, await admin.auth().createCustomToken(uid));
}

// 검증에 쓸 문서 하나 (참여자 본인 것)
const anyDoc = (await admin.firestore().collection("promises").limit(1).get()).docs[0];
const DOC_ID = anyDoc.id;

console.log("\n배포된 규칙 검증 — 클라이언트 SDK로 실제 요청\n" + "=".repeat(60));

console.log(`\n[참여자 본인]`);
await signInAs(OWNER);
await check("내 약속 목록 조회 (참여자 조건)", true, async () => {
  const s = await getDocs(
    query(
      collection(db, "promises"),
      where("participantIds", "array-contains", OWNER),
      orderBy("createdAt", "desc")
    )
  );
  return `${s.size}건`;
});
await check("내 약속 문서 직접 읽기", true, async () => {
  const s = await getDoc(doc(db, "promises", DOC_ID));
  return s.exists() ? "읽힘" : "문서 없음";
});
await check("비밀번호 해시 읽기", false, () => getDoc(doc(db, "promises", DOC_ID, "private", "auth")));
await check("참여자 상태 목록 읽기", true, async () => {
  const s = await getDocs(collection(db, "promises", DOC_ID, "members"));
  return `${s.size}건`;
});
await check("참여자 상태 직접 쓰기", false, () =>
  setDoc(doc(db, "promises", DOC_ID, "members", OWNER), { status: "arrived" })
);
await check("남의 상태 직접 쓰기", false, () =>
  setDoc(doc(db, "promises", DOC_ID, "members", "kakao:9999999999"), { status: "arrived" })
);
await check("조건 없이 전체 컬렉션 조회", false, () => getDocs(collection(db, "promises")));
await check("문서 직접 수정", false, () => updateDoc(doc(db, "promises", DOC_ID), { title: "해킹" }));
await check("문서 직접 삭제", false, () => deleteDoc(doc(db, "promises", DOC_ID)));
await check("문서 직접 생성", false, () =>
  addDoc(collection(db, "promises"), { title: "무단생성" })
);

console.log(`\n[참여자가 아닌 사람]`);
await signOut(auth);
await signInAs(OUTSIDER);
await check("남의 약속 문서 읽기", false, () => getDoc(doc(db, "promises", DOC_ID)));
await check("남의 약속 참여자 상태 읽기", false, () =>
  getDocs(collection(db, "promises", DOC_ID, "members"))
);
await check("본인 조건으로 목록 조회 (0건이어야 정상)", true, async () => {
  const s = await getDocs(
    query(
      collection(db, "promises"),
      where("participantIds", "array-contains", OUTSIDER),
      orderBy("createdAt", "desc")
    )
  );
  if (s.size !== 0) throw new Error(`0건이어야 하는데 ${s.size}건`);
  return "0건";
});
await check("남의 조건으로 목록 조회", false, () =>
  getDocs(query(collection(db, "promises"), where("participantIds", "array-contains", OWNER)))
);

console.log(`\n[로그인하지 않은 사람]`);
await signOut(auth);
await check("문서 읽기", false, () => getDoc(doc(db, "promises", DOC_ID)));
await check("목록 조회", false, () => getDocs(collection(db, "promises")));

await admin.auth().deleteUser(OUTSIDER).catch(() => {});

console.log("\n" + "=".repeat(60));
console.log(`통과 ${pass} / 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
