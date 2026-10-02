/**
 * 챗봇 서비스 호출 — widgetChat/history·send·reset(AUTH_ONLY, 스펙 §5.1)과 위젯관리 commWidgetMng/search(편집기용).
 * 요청 모양·응답 해제는 chat-model.ts 의 순수 함수가 맡는다. 여기는 fetch 만 얹는다.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import { createJsonApiClient } from "@/lib/http/json-api-client";

import {
  adminSearchRequest,
  CHAT_DEFAULT_ERROR,
  ChatServiceError,
  historyRequest,
  parseHistory,
  parseReply,
  resetRequest,
  sendRequest,
  unwrapChat,
  type ChatMessage,
  type ChatRequest,
} from "./chat-model";

const api = createJsonApiClient();

async function call(req: ChatRequest): Promise<Record<string, unknown>> {
  const res = await api.request<unknown>(req.url, { method: "POST", body: req.body });
  return unwrapChat(res);
}

/** 이 인스턴스의 대화 기록(오래된 순 전부). */
export async function fetchChatHistory(instId: string): Promise<ChatMessage[]> {
  return parseHistory(await call(historyRequest(instId)));
}

/** 질문을 보내고 도우미의 답을 받는다. 서버가 거절하거나 답을 못 받으면 던진다(사용자 메시지는 서버가 이미 저장). */
export async function sendChatMessage(instId: string, defId: string, message: string): Promise<ChatMessage> {
  const reply = parseReply(await call(sendRequest(instId, defId, message)));
  if (!reply) throw new ChatServiceError(CHAT_DEFAULT_ERROR);
  return reply;
}

/** 이 인스턴스의 대화 기록을 모두 지운다. */
export async function resetChat(instId: string): Promise<void> {
  await call(resetRequest(instId));
}

/** 위젯관리 정의 목록(편집기가 쿼리 위젯을 고를 때) — 거르기는 chat-model 의 buildQueryWidgetOptions. */
export async function searchQueryWidgetDefs(): Promise<unknown[]> {
  const out = await call(adminSearchRequest());
  return Array.isArray(out.defs) ? out.defs : [];
}
