// lib/session.ts
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
