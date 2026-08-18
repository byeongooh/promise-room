import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { createPromise } from "@/lib/promise-service";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요."),
  date: z.string().trim().min(1, "날짜를 선택해주세요."),
  time: z.string().trim().min(1, "시간을 선택해주세요."),
  location: z.string().trim().min(1, "장소를 선택해주세요."),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationPlaceId: z.string().nullable().optional(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`),
});

export const POST = withCaller(async (caller, req) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const id = await createPromise(caller, parsed.data);
  return NextResponse.json({ id }, { status: 201 });
});
