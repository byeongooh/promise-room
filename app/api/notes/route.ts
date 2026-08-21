import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, withCaller } from "@/lib/api-guard";
import { addNote, listNotes, removeNote } from "@/lib/note-service";

// 달력 메모 — 내 것만. 경로에 uid를 받지 않는다.
//
// 대상이 언제나 요청자 본인(caller.uid)이라, URL을 바꿔서 남의 메모를 보거나
// 지울 방법이 구조적으로 없다. promises/[id]/me 와 같은 판단이다.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 메모 전부. 달력이 달을 넘길 때마다 다시 부르지 않도록 한 번에 준다. */
export const GET = withCaller(async (caller) => {
  const notes = await listNotes(caller);
  return NextResponse.json({ notes }, { headers: { "Cache-Control": "no-store" } });
});

const addSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "날짜 형식이 올바르지 않습니다." }),
  text: z.string().trim().min(1, { message: "메모 내용이 비어 있습니다." }).max(200),
});

export const POST = withCaller(async (caller, req) => {
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const note = await addNote(caller, parsed.data.date, parsed.data.text);
  return NextResponse.json({ note });
});

const removeSchema = z.object({ id: z.string().min(1) });

export const DELETE = withCaller(async (caller, req) => {
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest("메모를 찾을 수 없습니다.");
  await removeNote(caller, parsed.data.id);
  return NextResponse.json({ ok: true });
});
