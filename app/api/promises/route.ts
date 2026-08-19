import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { createPromise } from "@/lib/promise-service";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요."),
  // 날짜·시간은 비워둘 수 있다. 언제 만날지 아직 안 정한 채로 방을 열고
  // 장소부터 맞춰보는 흐름이 실제로 흔하다. 둘 다 빈 문자열이면 "정하는 중"이다.
  // (한쪽만 비는 건 허용하지 않는다 — 시간만 있고 날짜가 없으면 화면에서
  //  계산할 수 있는 게 없다.)
  date: z.string().trim().max(10).default(""),
  time: z.string().trim().max(5).default(""),
  // 장소도 비워둘 수 있다. 날짜와 같은 이유 — 어디서 볼지 먼저 맞춰야 하는
  // 모임이 있다. 온라인 플랜이면 애초에 장소라는 게 없다.
  location: z.string().trim().max(200).default(""),
  meetingMode: z.enum(["inPerson", "online"]).default("inPerson"),
  meetingUrl: z.string().trim().max(500).nullable().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationPlaceId: z.string().nullable().optional(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`),
}).refine((v) => (v.date === "") === (v.time === ""), {
  message: "날짜와 시간은 같이 정하거나 같이 비워두세요.",
  path: ["date"],
});

export const POST = withCaller(async (caller, req) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const id = await createPromise(caller, parsed.data);
  return NextResponse.json({ id }, { status: 201 });
});
