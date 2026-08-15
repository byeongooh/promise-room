// 기존 약속 문서를 ID 기반(v2) 구조로 옮긴다.
//
//   node scripts/migrate-promises.mjs --phase=1            (미리보기, 기본값)
//   node scripts/migrate-promises.mjs --phase=1 --apply    (실제 적용)
//   node scripts/migrate-promises.mjs --phase=2 --apply    (평문 비밀번호 제거)
//
// 1차: 추가만 한다. creatorId/participantIds를 표준형으로 채우고 비밀번호
//      해시를 만든다. 평문 password와 레거시 creator/participants는 남겨둔다.
// 2차: 파괴적. 규칙 전환이 끝난 뒤에만 실행한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

import { hashPassword, verifyPassword, isHashed } from "../lib/password.ts";
import { toCanonicalUid, isCanonicalUid } from "../lib/uid.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// 이름만 남아있는 참여자를 ID로 이어붙이기 위한 표.
// 여기 없는 사람은 링크+비밀번호로 다시 참여해야 한다.
const KNOWN_USERS = {
  "김병오": "kakao:4746129449",
};

// ---------------------------------------------------------------- 준비

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PHASE = Number((args.find((a) => a.startsWith("--phase=")) ?? "--phase=1").split("=")[1]);

function loadEnv() {
  const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i === -1) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnv();
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    // .env.local에는 줄바꿈이 \n 두 글자로 들어있다.
    privateKey: env.FIREBASE_PRIVATE_KEY.split(String.fromCharCode(92, 110)).join("\n"),
  }),
});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ---------------------------------------------------------------- 백업

async function backup(docs) {
  const dir = path.join(ROOT, ".migration-backup");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `promises-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const dump = docs.map((d) => ({ id: d.id, data: d.data() }));
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), "utf8");
  console.log(`백업 저장: ${path.relative(ROOT, file)} (${dump.length}건)\n`);
}

// ---------------------------------------------------------------- 1차

async function phase1() {
  const snap = await db.collection("promises").get();
  await backup(snap.docs);

  const unresolved = new Set();
  let changed = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const updates = {};
    const notes = [];

    // 1) 작성자
    const creatorName = d.creatorName ?? d.creator ?? null;
    const creatorId = d.creatorId
      ? toCanonicalUid(d.creatorId)
      : creatorName
        ? KNOWN_USERS[creatorName]
        : undefined;

    if (creatorId && creatorId !== d.creatorId) {
      updates.creatorId = creatorId;
      notes.push(`creatorId: ${d.creatorId ?? "(없음)"} → ${creatorId}`);
    }
    if (creatorName && !d.creatorName) {
      updates.creatorName = creatorName;
      notes.push(`creatorName: → ${creatorName}`);
    }
    // 작성자 ID를 모르면, 본인이 비밀번호를 알고 다시 참여할 때 1회 회수하게 표시
    if (!creatorId && creatorName && d.legacyClaimable !== true) {
      updates.legacyClaimable = true;
      notes.push(`legacyClaimable: true (작성자 "${creatorName}" ID 미상)`);
      unresolved.add(creatorName);
    }

    // 2) 참여자 — 기존 ID + 이름으로 알아낸 ID를 합친다
    const ids = new Set((d.participantIds ?? []).map((x) => toCanonicalUid(x)).filter(Boolean));
    const names = new Set([...(d.participantNames ?? []), ...(d.participants ?? [])]);
    if (creatorId) ids.add(creatorId); // 작성자는 반드시 참여자에 포함

    for (const n of names) {
      const mapped = KNOWN_USERS[n];
      if (mapped) ids.add(mapped);
      else unresolved.add(n);
    }

    const nextIds = [...ids];
    const prevIds = d.participantIds ?? [];
    if (nextIds.length !== prevIds.length || nextIds.some((x, i) => x !== prevIds[i])) {
      updates.participantIds = nextIds;
      notes.push(`participantIds: [${prevIds.join(", ")}] → [${nextIds.join(", ")}]`);
    }

    const nextNames = [...names];
    const prevNames = d.participantNames ?? [];
    if (nextNames.length !== prevNames.length || nextNames.some((x, i) => x !== prevNames[i])) {
      updates.participantNames = nextNames;
      notes.push(`participantNames: → [${nextNames.join(", ")}]`);
    }

    if (!d.status) {
      updates.status = "active";
      notes.push("status: → active");
    }

    // 3) 비밀번호 해시 (이미 있으면 건드리지 않는다 — 재실행 안전)
    const authRef = db.doc(`promises/${doc.id}/private/auth`);
    const authSnap = await authRef.get();
    let hashToWrite = null;
    if (!authSnap.exists) {
      if (typeof d.password === "string" && d.password.length > 0) {
        hashToWrite = await hashPassword(d.password);
        if (!(await verifyPassword(hashToWrite, d.password))) {
          throw new Error(`[${doc.id}] 해시 검증 실패 — 전체 중단`);
        }
        notes.push(`private/auth 해시 생성 (평문 "${d.password}" 는 유지)`);
      } else {
        notes.push("⚠ 비밀번호 없음 — 해시 생성 불가");
      }
    }

    // 4) 안전장치: 표준형이 아닌 ID가 하나라도 있으면 전체 중단
    for (const id of [updates.creatorId, ...(updates.participantIds ?? [])].filter(Boolean)) {
      if (!isCanonicalUid(id)) {
        throw new Error(`[${doc.id}] 표준형이 아닌 ID: "${id}" — 전체 중단`);
      }
    }

    const hasWork = Object.keys(updates).length > 0 || hashToWrite;
    console.log(`--- ${doc.id} "${d.title}"`);
    if (!hasWork) {
      console.log("    변경 없음");
    } else {
      notes.forEach((n) => console.log("    " + n));
      changed++;
      if (APPLY) {
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = FieldValue.serverTimestamp();
          await doc.ref.update(updates);
        }
        if (hashToWrite) {
          await authRef.set({
            algo: "scrypt",
            hash: hashToWrite,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
    console.log();
  }

  console.log("=".repeat(64));
  console.log(`변경 대상 ${changed}건 / 전체 ${snap.size}건`);
  if (unresolved.size > 0) {
    console.log(`\nID를 모르는 이름 (링크+비밀번호로 다시 참여해야 함):`);
    [...unresolved].forEach((n) => console.log("  - " + n));
  }
  console.log(APPLY ? "\n✅ 실제 적용 완료" : "\n※ 미리보기입니다. 적용하려면 --apply 를 붙이세요.");
}

// ---------------------------------------------------------------- 2차

async function phase2() {
  const snap = await db.collection("promises").get();
  await backup(snap.docs);

  // 안전장치: 모든 문서가 participantIds와 해시를 갖췄을 때만 진행
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!(d.participantIds?.length > 0)) {
      throw new Error(`[${doc.id}] participantIds 비어있음 — 2차 중단`);
    }
    const auth = await db.doc(`promises/${doc.id}/private/auth`).get();
    if (!auth.exists || !isHashed(auth.data()?.hash)) {
      throw new Error(`[${doc.id}] 해시 없음 — 2차 중단`);
    }
  }

  for (const doc of snap.docs) {
    const d = doc.data();
    const updates = {};
    const kept = [];

    // 평문 비밀번호: 해시가 있으므로 항상 제거
    if ("password" in d) updates.password = FieldValue.delete();

    // 레거시 이름 목록: participantNames로 옮겨졌으므로 제거.
    // 오히려 남겨두면 이름만 등록된 사람이 참여를 시도할 때 "이미 참여 중"으로
    // 조기 종료돼 participantIds에 못 들어가는 문제가 생긴다.
    if ("participants" in d) updates.participants = FieldValue.delete();

    // creator(이름)는 creatorId가 확정된 문서에서만 제거한다.
    // 아직 작성자 ID를 모르는 문서는 본인이 재참여할 때 이 이름으로 대조해
    // 작성자 권한을 회수하므로, 지우면 영영 회수할 수 없다.
    if ("creator" in d) {
      if (d.creatorId) updates.creator = FieldValue.delete();
      else kept.push("creator(작성자 권한 회수용으로 보존)");
    }

    const removing = Object.keys(updates).join(", ") || "없음";
    console.log(`--- ${doc.id} "${d.title}"`);
    console.log(`    제거: ${removing}${kept.length ? ` | 보존: ${kept.join(", ")}` : ""}`);
    if (APPLY && Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await doc.ref.update(updates);
    }
  }
  console.log(APPLY ? "\n✅ 2차 적용 완료" : "\n※ 미리보기입니다.");
}

// ---------------------------------------------------------------- 실행

console.log(`\n마이그레이션 ${PHASE}차 — ${APPLY ? "실제 적용" : "미리보기(dry-run)"}\n`);
if (PHASE === 1) await phase1();
else if (PHASE === 2) await phase2();
else throw new Error("--phase=1 또는 --phase=2 만 지원합니다.");
process.exit(0);
