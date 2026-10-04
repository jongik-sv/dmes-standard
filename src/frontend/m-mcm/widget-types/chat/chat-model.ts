/**
 * AI 챗봇 유형의 순수 로직 — 메시지 목록 병합·글자 수 제한·링크 변환·요청 모양·편집기 설정 검사
 * (스펙 2026-10-02-widget-admin-generic §5.1·§6·§9, 계획 Task 14).
 * 렌더러(renderer.tsx)·편집기(editor.tsx)·호출(api.ts)이 이 파일만 부른다. @dk-oasis/shared 런타임을 import 하지 않아
 * m-mcm vitest(node 환경)가 shared dist 없이 시험한다.
 */

/* ------------------------------------------------------------------ 상수 */

/** 메시지 길이 상한(서버 §9: 1~2000자). 서버 `String.length()` 와 같게 UTF-16 코드 단위로 센다. */
export const CHAT_MAX_LENGTH = 2000;
/** 답에 붙는 화면 링크 상한(서버 계획 Task 11: 한 차례 최대 5개). */
export const CHAT_MAX_LINKS = 5;
/** 정의에 welcome 이 없을 때의 첫 인사. */
export const CHAT_DEFAULT_WELCOME = "무엇을 도와드릴까요?";
/** 서버가 못 받은 답·전송 실패의 기본 문구(스펙 §9). */
export const CHAT_DEFAULT_ERROR = "답을 받지 못했습니다. 잠시 뒤 다시 시도하세요.";
/** 위젯이 놓이는 포털 홈의 menuId — A 의 secWidget 호출과 같다(AUTH_ONLY 서비스라 권한 판정에 쓰이지 않는다). */
export const CHAT_MENU_ID = "HOME";
/** 편집기가 쿼리 위젯 목록을 읽는 위젯관리 화면 objId. */
export const ADMIN_MENU_ID = "commWidgetMng";
/**
 * 편집기 시스템 프롬프트 칸 안내(스펙 §5.1 widgetDef/list·§6 chat). widgetDef/list 가 systemPrompt 를 지워 화면 목록에서는
 * 숨기지만, 매 요청 LLM 지시문으로 들어가므로 사용자가 대화로 요구하면 드러날 수 있다 — 비밀 보장이 아니다(2026-10-03 보안 지적).
 */
export const CHAT_SYSTEM_PROMPT_NOTE =
  "도우미의 역할·말투·지켜야 할 규칙. 화면 목록에서는 숨기지만 대화 중에 사용자에게 드러날 수 있으니 비밀(내부 주소·인증키·공개하지 않는 정책 문구 등)은 넣지 마세요.";

const CHAT_BASE = "/api/mcm/oasis/widgetChat";
const ADMIN_SEARCH_URL = "/api/mcm/oasis/commWidgetMng/search";

/* ------------------------------------------------------------------ 공용 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type ChatRole = "user" | "assistant";

export interface ChatLink {
  /** 포털이 여는 값(`openPortalPage(pageId)`). */
  pageId: string;
  title: string;
}

export interface ChatMessage {
  /** React 키 — `{role}-{seq}`. */
  key: string;
  seq: number;
  role: ChatRole;
  content: string;
  links: ChatLink[];
  /** 서버 응답을 기다리는 낙관적 사용자 메시지. */
  pending?: boolean;
}

/* ------------------------------------------------------------------ 글자 수·키 */

/** 입력 칸 값 기준 남은 글자 수(음수면 초과). */
export function remainingChars(text: string): number {
  return CHAT_MAX_LENGTH - text.length;
}

/** 보낼 글 검사 — 앞뒤 공백을 뺀 길이가 1~2000자여야 한다. 통과면 null, 아니면 문구. */
export function validateDraft(text: string): string | null {
  const len = text.trim().length;
  if (len === 0) return "메시지를 입력하세요.";
  if (len > CHAT_MAX_LENGTH) return "2,000자까지 입력할 수 있습니다.";
  return null;
}

export function canSend(text: string, busy: boolean): boolean {
  return !busy && validateDraft(text) === null;
}

/** 보내기 실패 뒤 입력 칸 값 — 그사이 입력 칸이 비어 있으면(공백뿐 포함) 보낸 글을 되돌리고, 새로 쓴 글이 있으면 그대로 둔다. */
export function restoreDraft(current: string, sent: string): string {
  return current.trim() === "" ? sent : current;
}

/**
 * 입력 칸 키 — Enter 는 보내기, Shift+Enter 는 줄바꿈. 한글 조합 중(isComposing·keyCode 229)의 Enter 는 글자 확정이라
 * 보내면 마지막 글자가 한 번 더 들어간다.
 */
export function shouldSendOnKey(e: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  return true;
}

/* ------------------------------------------------------------------ 링크·메시지 해석 */

/** 답의 `links`(배열 또는 LINKS_JSON 문자열) → {pageId,title}. pageId 없는 항목은 버리고 중복·초과(5개)를 자른다. */
export function parseLinks(raw: unknown): ChatLink[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: ChatLink[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!isRecord(item)) continue;
    const pageId = typeof item.pageId === "string" ? item.pageId.trim() : "";
    if (!pageId || seen.has(pageId)) continue;
    seen.add(pageId);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    out.push({ pageId, title: title || pageId });
    if (out.length >= CHAT_MAX_LINKS) break;
  }
  return out;
}

const messageKey = (role: ChatRole, seq: number) => `${role}-${seq}`;

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw)) return null;
  const role = raw.role === "user" || raw.role === "assistant" ? raw.role : null;
  const seq = raw.seq === null || raw.seq === undefined || raw.seq === "" ? NaN : Number(raw.seq);
  if (!role || !Number.isFinite(seq)) return null;
  return {
    key: messageKey(role, seq),
    seq,
    role,
    content: typeof raw.content === "string" ? raw.content : "",
    links: parseLinks(raw.links),
  };
}

/** history 응답(`messages`) → seq 오름차순 메시지. 해석 못 하는 줄은 버린다. */
export function parseHistory(out: Record<string, unknown>): ChatMessage[] {
  const rows = out.messages;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(parseMessage)
    .filter((m): m is ChatMessage => m !== null)
    .sort((a, b) => a.seq - b.seq);
}

/** send 응답(`reply`) → assistant 메시지. 없거나 깨졌으면 null. */
export function parseReply(out: Record<string, unknown>): ChatMessage | null {
  return parseMessage(out.reply);
}

/* ------------------------------------------------------------------ 목록 병합 */

function nextSeq(list: readonly ChatMessage[]): number {
  return list.reduce((max, m) => Math.max(max, m.seq), 0) + 1;
}

/** 낙관적 사용자 메시지를 목록 끝에 붙인다(seq = 마지막 + 1 — 서버가 저장할 번호와 같다). */
export function appendPending(list: readonly ChatMessage[], text: string): ChatMessage[] {
  const seq = nextSeq(list);
  return [...list, { key: messageKey("user", seq), seq, role: "user", content: text.trim(), links: [], pending: true }];
}

export function hasPending(list: readonly ChatMessage[]): boolean {
  return list.some((m) => m.pending);
}

const settle = (list: readonly ChatMessage[]): ChatMessage[] => list.map((m) => (m.pending ? { ...m, pending: false } : m));

/** 답이 왔다 — 보낸 질문의 pending 을 풀고 답을 붙인다(같은 키가 있으면 바꿔 넣는다). */
export function resolvePending(list: readonly ChatMessage[], reply: ChatMessage): ChatMessage[] {
  const settled = settle(list);
  const at = settled.findIndex((m) => m.key === reply.key);
  if (at >= 0) {
    settled[at] = { ...reply, pending: false };
    return settled;
  }
  return [...settled, { ...reply, pending: false }];
}

/** 전송 실패 — 보낸 질문은 목록에 남기고 pending 만 푼다(서버가 사용자 메시지는 이미 저장했다). */
export function failPending(list: readonly ChatMessage[]): ChatMessage[] {
  return settle(list);
}

export interface ChatDisplayItem {
  key: string;
  role: ChatRole;
  content: string;
  links: ChatLink[];
  pending: boolean;
  /** 저장하지 않는 첫 인사 말풍선. */
  welcome: boolean;
}

/** 화면 목록 — 기록이 비어 있던 대화면 첫 인사(저장 안 함)를 맨 위에 두고, 이어서 메시지를 그린다. */
export function displayItems(args: { messages: readonly ChatMessage[]; welcome: string; showWelcome: boolean }): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  const welcome = args.welcome.trim();
  if (args.showWelcome && welcome) {
    items.push({ key: "welcome", role: "assistant", content: welcome, links: [], pending: false, welcome: true });
  }
  for (const m of args.messages) {
    items.push({ key: m.key, role: m.role, content: m.content, links: m.links, pending: m.pending === true, welcome: false });
  }
  return items;
}

/** 정의의 첫 인사 — 값이 없으면 기본 문구, 빈 문자열이면 인사 없음. */
export function resolveWelcome(definition: unknown): string {
  if (!isRecord(definition) || typeof definition.welcome !== "string") return CHAT_DEFAULT_WELCOME;
  return definition.welcome.trim();
}

/** 위젯관리 화면 미리보기(WidgetPreview)가 쓰는 자리표시 값 — 저장 전 정의의 widgetId 와 모든 미리보기의 instId. */
export const PREVIEW_WIDGET_ID = "def.preview";
export const PREVIEW_INST_ID = "preview";

/**
 * 서버와 실제로 대화하는지 — 저장된 정의(`def.…`)를 홈 등에 놓은 위젯만 대화한다. 관리 화면 미리보기(instId `preview`,
 * 저장 전이면 widgetId `def.preview`)나 `__preview` 정의는 서버를 부르지 않고 첫 인사만 보인다. 미리보기는 저장된 설정으로
 * 답하므로 화면의 편집값과 어긋나고, 관리자 본인의 `preview` 인스턴스에 기록만 쌓이기 때문이다.
 */
export function isLiveChat(widgetId: string, definition: unknown, instanceId?: string): boolean {
  if (!/^def\./.test(widgetId) || widgetId === PREVIEW_WIDGET_ID) return false;
  if (instanceId === PREVIEW_INST_ID) return false;
  return !(isRecord(definition) && definition.__preview);
}

/* ------------------------------------------------------------------ 요청·응답 */

export interface ChatRequest {
  url: string;
  body: { meta: { menuId: string }; params: Record<string, unknown> };
}

const chatRequest = (action: string, params: Record<string, unknown>): ChatRequest => ({
  url: `${CHAT_BASE}/${action}`,
  body: { meta: { menuId: CHAT_MENU_ID }, params },
});

/** userId 는 보내지 않는다 — 서버가 인증 컨텍스트로만 채운다(IDOR 방지, 스펙 §5). */
export const historyRequest = (instId: string): ChatRequest => chatRequest("history", { instId });
export const sendRequest = (instId: string, defId: string, message: string): ChatRequest =>
  chatRequest("send", { instId, defId, message: message.trim() });
export const resetRequest = (instId: string): ChatRequest => chatRequest("reset", { instId });

/** 위젯관리 화면의 정의 목록 호출(편집기가 쿼리 위젯을 고를 때). */
export const adminSearchRequest = (): ChatRequest => ({
  url: ADMIN_SEARCH_URL,
  body: { meta: { menuId: ADMIN_MENU_ID }, params: { includeConfig: false } },
});

/** 서버가 업무 규칙으로 거절한 오류(HTTP 200 + meta.success=false). 메시지는 서버가 쓴 한국어 문장이다. */
export class ChatServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatServiceError";
  }
}

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** 응답 봉투 해제 — csa 화면 api.ts 와 같은 규칙: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows. */
export function unwrapChat(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new ChatServiceError(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (isRecord(inner)) Object.assign(out, inner);
  }
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) out[key] = val?.rows ?? [];
  }
  return out;
}

/** 화면에 보일 오류 — 서버 업무 메시지는 그대로, 전송·엔진 오류는 기본 문구(예외 원문을 싣지 않는다, Local-Rules §13). */
export function chatErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ChatServiceError && err.message ? err.message : fallback;
}

/* ------------------------------------------------------------------ 편집기 설정 */

export interface ChatConfig {
  systemPrompt: string;
  welcome: string;
  pageGuide: boolean;
  dataQueryDefIds: string[];
}

/** 정의 설정(CONFIG_JSON 파싱값) → 편집기 값. 빠진 값은 기본값, 틀린 형은 바로잡는다. */
export function normalizeChatConfig(raw: unknown): ChatConfig {
  const o = isRecord(raw) ? raw : {};
  const ids: string[] = [];
  if (Array.isArray(o.dataQueryDefIds)) {
    for (const id of o.dataQueryDefIds) {
      if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
    }
  }
  return {
    systemPrompt: typeof o.systemPrompt === "string" ? o.systemPrompt : "",
    welcome: typeof o.welcome === "string" ? o.welcome : CHAT_DEFAULT_WELCOME,
    pageGuide: typeof o.pageGuide === "boolean" ? o.pageGuide : true,
    dataQueryDefIds: ids,
  };
}

export interface QueryWidgetOption {
  value: string;
  label: string;
}

/** 「데이터 질의에 쓸 쿼리 위젯」 후보 — `typeId` 가 `query-` 로 시작하고 사용 중(useYn≠N)인 정의. */
function queryWidgetRows(defs: unknown): { widgetId: string; title: string }[] {
  if (!Array.isArray(defs)) return [];
  const rows: { widgetId: string; title: string }[] = [];
  for (const d of defs) {
    if (!isRecord(d)) continue;
    const widgetId = typeof d.widgetId === "string" ? d.widgetId : "";
    const typeId = typeof d.typeId === "string" ? d.typeId : "";
    if (!widgetId || !typeId.startsWith("query-") || d.useYn === "N") continue;
    rows.push({ widgetId, title: typeof d.title === "string" ? d.title.trim() : "" });
  }
  return rows;
}

export function queryWidgetIds(defs: unknown): string[] {
  return queryWidgetRows(defs).map((r) => r.widgetId);
}

/**
 * 다중 선택 목록 — 후보를 「제목(ID)」(제목이 없으면 ID)로 가나다순으로 늘어놓는다.
 * 이미 골라 둔 것이 후보에 없으면(삭제·사용 중지) 「ID (사용할 수 없음)」로 뒤에 붙여 관리자가 알아보고 뺄 수 있게 한다.
 * 목록을 아직 못 불러왔으면(defs 가 배열이 아님 — 불러오는 중·실패) 후보를 알 수 없으므로 고른 ID 를 그대로 보인다.
 */
export function buildQueryWidgetOptions(defs: unknown, selectedIds: readonly string[]): QueryWidgetOption[] {
  const options = queryWidgetRows(defs)
    .map((r) => ({ value: r.widgetId, label: r.title ? `${r.title}(${r.widgetId})` : r.widgetId }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const known = new Set(options.map((o) => o.value));
  const listed = Array.isArray(defs);
  for (const id of selectedIds) {
    if (known.has(id)) continue;
    known.add(id);
    options.push({ value: id, label: listed ? `${id} (사용할 수 없음)` : id });
  }
  return options;
}

/**
 * 편집기 검사(저장 막기용 오류 목록). `availableIds` 는 불러온 후보 ID — 목록을 못 불러왔으면(null) 판단하지 않아
 * 기존 선택을 지우지 않고 저장할 수 있다.
 */
export function validateChatConfig(cfg: ChatConfig, availableIds: readonly string[] | null): string[] {
  const errors: string[] = [];
  if (availableIds) {
    const available = new Set(availableIds);
    const stale = cfg.dataQueryDefIds.filter((id) => !available.has(id));
    if (stale.length > 0) {
      errors.push(`사용할 수 없는 쿼리 위젯이 선택되어 있습니다(${stale.join(", ")}). 선택에서 빼 주세요.`);
    }
  }
  return errors;
}
