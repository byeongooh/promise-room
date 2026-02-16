import admin from "firebase-admin";

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) throw new Error("FIREBASE_PRIVATE_KEY missing");
  return key.replace(/\\n/g, "\n");
}

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId) throw new Error("FIREBASE_PROJECT_ID missing");
  if (!clientEmail) throw new Error("FIREBASE_CLIENT_EMAIL missing");

  const privateKey = getPrivateKey();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const db = admin.firestore();
export { admin };
