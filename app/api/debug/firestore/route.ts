import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  const snap = await db.collection("promises").limit(1).get();
  return NextResponse.json({ ok: true, size: snap.size });
}
