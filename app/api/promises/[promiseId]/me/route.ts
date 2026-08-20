import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import {
  setMemberArrival,
  setMemberAttendance,
  setMemberRoute,
  setMemberStatus,
  setPlaceObjection,
} from "@/lib/promise-service";
import { setMemberOrigin } from "@/lib/place-service";

// 이 약속에서의 "나" — 고른 경로와 확인/가는 중/도착 상태.
//
// 남의 상태는 여기서 바꿀 수 없다. 대상은 언제나 요청자 본인(caller.uid)이고
// 경로에 uid를 받지 않는다. 그래서 URL만 보고 남을 건드릴 방법이 없다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ promiseId: string }> };

const routeSchema = z.object({
  kind: z.enum(["car", "transit"], {
    errorMap: () => ({ message: "경로 종류가 올바르지 않습니다." }),
  }),
  label: z.string().min(1).max(40),
  durationSec: z.number().int().positive().max(24 * 60 * 60),
  origin: z.object({
    label: z.string().min(1).max(60),
    lat: z.number(),
    lng: z.number(),
  }),
  mapObj: z.string().max(4000).nullish(),
  transfers: z.number().int().min(0).max(20).nullish(),
  fare: z.number().int().min(0).nullish(),
  firstStation: z.string().max(60).nullish(),
});

// route와 status 둘 다 선택이다. 경로만 저장할 때도, 상태만 바꿀 때도
// 같은 엔드포인트를 쓴다. route: null 은 "고른 경로 지우기"라는 뜻이라
// "안 보냄"과 구분해야 해서 nullable + optional을 따로 쓴다.
const originSchema = z.object({
  label: z.string().min(1).max(60),
  lat: z.number(),
  lng: z.number(),
});

const patchSchema = z
  .object({
    route: routeSchema.nullable().optional(),
    // 경로를 고르지 않아도 출발지만 정해둘 수 있다. 장소 후보를 계산할 때
    // 참여자 전원의 출발지가 필요해서다.
    origin: originSchema.nullable().optional(),
    // 버튼으로만 고르는 값이라 사용자가 틀릴 일은 없지만, 오류 문구는
    // 이 프로젝트 규칙대로 한국어로 돌려준다.
    status: z
      .enum(["unknown", "onway", "arrived"], {
        errorMap: () => ({ message: "상태 값이 올바르지 않습니다." }),
      })
      .optional(),
    // "나는 오늘 몇 시까지 가요" — 날짜는 플랜에 이미 있으므로 시각만 받는다.
    // ISO를 받지 않는 이유는 promise-service의 setMemberArrival 주석 참고.
    // null이면 지운다("약속 시각에 맞춰 온다"로 되돌리기).
    arrivalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "도착 시각이 올바르지 않습니다." })
      .nullable()
      .optional(),
    // 이번 플랜에 갈지. 방을 나가는 것(DELETE /join)과는 다른 축이다.
    attendance: z
      .enum(["going", "cant"], {
        errorMap: () => ({ message: "참석 값이 올바르지 않습니다." }),
      })
      .optional(),
    absenceReason: z.string().max(200).nullable().optional(),
    // "이 장소면 가기 어려워요". null이면 거둔다.
    placeObjection: z.string().max(200).nullable().optional(),
  })
  .refine(
    (v) =>
      v.route !== undefined ||
      v.status !== undefined ||
      v.origin !== undefined ||
      v.arrivalTime !== undefined ||
      v.attendance !== undefined ||
      v.placeObjection !== undefined,
    { message: "바꿀 내용이 없습니다." }
  );

export const PATCH = withCaller<Ctx>(async (caller, req, ctx) => {
  const { promiseId } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  let leaveAt: string | null = null;
  let arrivalAt: string | null = null;

  if (parsed.data.route !== undefined) {
    ({ leaveAt } = await setMemberRoute(caller, promiseId, parsed.data.route));
  }
  if (parsed.data.status !== undefined) {
    await setMemberStatus(caller, promiseId, parsed.data.status);
  }
  if (parsed.data.origin !== undefined) {
    await setMemberOrigin(caller, promiseId, parsed.data.origin);
  }
  if (parsed.data.arrivalTime !== undefined) {
    ({ arrivalAt } = await setMemberArrival(caller, promiseId, parsed.data.arrivalTime));
  }
  if (parsed.data.attendance !== undefined) {
    await setMemberAttendance(
      caller,
      promiseId,
      parsed.data.attendance,
      parsed.data.absenceReason
    );
  }
  if (parsed.data.placeObjection !== undefined) {
    await setPlaceObjection(caller, promiseId, parsed.data.placeObjection);
  }

  return NextResponse.json({ ok: true, leaveAt, arrivalAt });
});
