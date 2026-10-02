/**
 * 메모장 서비스 호출 — widgetMemo/load·save(AUTH_ONLY, 스펙 §17.3).
 * 요청 모양·응답 해제는 memo-model.ts 의 순수 함수가 맡는다. 여기는 fetch 만 얹는다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import {
  loadRequest,
  MEMO_SAVE_ERROR,
  MemoServiceError,
  parseMemo,
  saveRequest,
  unwrapMemo,
  type MemoRecord,
  type MemoRequest,
  type SaveInput,
} from "./memo-model";

const api = createJsonApiClient();

async function call(req: MemoRequest): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(req.url, { method: "POST", body: req.body });
  return unwrapMemo(res);
}

/** 이 칸(instId)의 내 메모. 아직 쓴 적이 없으면 null. */
export async function fetchMemo(instId: string): Promise<MemoRecord | null> {
  return parseMemo((await call(loadRequest(instId))).memo);
}

/** 메모를 저장하고 서버가 돌려준 메모를 받는다. 서버가 거절하거나 메모를 못 받으면 던진다. */
export async function saveMemo(input: SaveInput): Promise<MemoRecord> {
  const saved = parseMemo((await call(saveRequest(input))).memo);
  if (!saved) throw new MemoServiceError(MEMO_SAVE_ERROR);
  return saved;
}
