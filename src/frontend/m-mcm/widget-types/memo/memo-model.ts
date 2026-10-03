/**
 * 메모장 유형의 순수 로직 — 정의 설정 읽기·검사, 형식 값, 요청 모양·응답 해제, 미리보기 판정
 * (스펙 2026-10-02-widget-admin-generic §17).
 * 렌더러(renderer.tsx)·편집기(editor.tsx)·호출(api.ts)이 이 파일만 부른다. @dk-oasis/shared 런타임을 import 하지 않아
 * m-mcm vitest(node 환경)가 shared dist 없이 시험한다.
 */

/* ------------------------------------------------------------------ 상수 */

/** 메모 길이 상한(서버 §17.3: 20,000자). 서버 `String.length()` 와 같게 UTF-16 코드 단위로 센다. */
export const MEMO_MAX_LENGTH = 20000;

export const MEMO_EMPTY_VIEW_TEXT = "메모가 없습니다. [편집]을 눌러 쓰세요";
export const MEMO_PREVIEW_TEXT = "미리보기에서는 저장하지 않습니다";
/** 위젯관리 [기본 배치] 보드 안의 개인 메모 칸 — 실제 칸이지만 관리자 본인 메모가 되지 않게 미리보기처럼 다룬다(§17.5). */
export const MEMO_BOARD_PREVIEW_TEXT = "기본 배치 화면에서는 개인 메모를 쓰지 않습니다(사용자가 홈에서 씁니다)";
export const MEMO_SHARED_EMPTY_TEXT = "내용이 없습니다";
export const MEMO_LOAD_ERROR = "메모를 불러오지 못했습니다.";
export const MEMO_SAVE_ERROR = "메모를 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.";
export const MEMO_TOO_LONG_MESSAGE = "메모 내용은 20,000자까지 쓸 수 있습니다.";
export const MEMO_PERSONAL_NOTE = "사용자가 홈에서 직접 씁니다. 형식은 새 메모의 처음 형식입니다";

/** 개인 메모 md 편집기(shared MarkdownField)의 편집 방식(서식·MD) 기억 키 — 메모장끼리만 같이 바뀐다(공지·기본 키와 따로). */
export const MEMO_MD_MODE_STORAGE_KEY = "mcm-memo:mdMode";

/** 위젯이 놓이는 포털 홈의 menuId — 다른 AUTH_ONLY 위젯 서비스(widgetChat 등)와 같다(권한 판정에 쓰이지 않는다). */
export const MEMO_MENU_ID = "HOME";
const MEMO_BASE = "/api/mcm/oasis/widgetMemo";

/* ------------------------------------------------------------------ 종류·형식 */

export type MemoScope = "shared" | "personal";
export type MemoFormat = "text" | "md" | "html";

export const MEMO_SCOPES: readonly { value: MemoScope; label: string }[] = [
  { value: "shared", label: "공용 메모" },
  { value: "personal", label: "개인 메모" },
];

export const MEMO_FORMATS: readonly { value: MemoFormat; label: string }[] = [
  { value: "text", label: "텍스트" },
  { value: "md", label: "md" },
  { value: "html", label: "html" },
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const isMemoScope = (v: unknown): v is MemoScope => v === "shared" || v === "personal";
export const isMemoFormat = (v: unknown): v is MemoFormat => v === "text" || v === "md" || v === "html";

/** 공용 NoticeBodyView 의 형식 이름. md·html 은 글(md)·html(스크립트 끔) 위젯과 같은 보기 경로다. */
export function viewFormat(format: MemoFormat): "TEXT" | "MD" | "HTML" {
  return format === "md" ? "MD" : format === "html" ? "HTML" : "TEXT";
}

/* ------------------------------------------------------------------ 정의 설정 */

export interface MemoConfig {
  scope: MemoScope;
  format: MemoFormat;
  content: string;
}

/** 초기 설정(type.meta.ts initialConfig 와 같다). */
export const MEMO_DEFAULT_CONFIG: MemoConfig = { scope: "personal", format: "text", content: "" };

/** 정의 설정(CONFIG_JSON 파싱값) → 화면 값. 빠지거나 틀린 값은 기본값으로 바로잡는다. */
export function readMemoConfig(definition: unknown): MemoConfig {
  const r = isRecord(definition) ? definition : {};
  return {
    scope: isMemoScope(r.scope) ? r.scope : MEMO_DEFAULT_CONFIG.scope,
    format: isMemoFormat(r.format) ? r.format : MEMO_DEFAULT_CONFIG.format,
    content: typeof r.content === "string" ? r.content : "",
  };
}

/** 서버 WidgetDefConfigRules(§17.1)와 같은 문구 — 화면에서 먼저 막아도 서버가 막아도 같은 말이 보이게 한다. */
export const MEMO_SCOPE_ERROR = "메모 종류(scope)는 shared 또는 personal 이어야 합니다.";
export const MEMO_FORMAT_ERROR = "메모 형식(format)은 text·md·html 중 하나여야 합니다.";
export const MEMO_CONTENT_TYPE_ERROR = "메모 내용(content)은 문자열이어야 합니다.";

/**
 * 편집기 검사(저장 막기용 오류 목록). 읽은 값이 아니라 받은 원본을 검사한다 — 바로잡힌 값 뒤에 틀린 값이 숨지 않게.
 * 서버가 저장을 거절하는 경우와 같다: scope·format 은 빠져도 오류이고, content 는 없거나 null 이면 괜찮다.
 */
export function validateMemoConfig(raw: unknown): string[] {
  const r = isRecord(raw) ? raw : {};
  const errors: string[] = [];
  if (!isMemoScope(r.scope)) errors.push(MEMO_SCOPE_ERROR);
  if (!isMemoFormat(r.format)) errors.push(MEMO_FORMAT_ERROR);
  const content = r.content;
  if (content !== undefined && content !== null) {
    if (typeof content !== "string") errors.push(MEMO_CONTENT_TYPE_ERROR);
    else if (content.length > MEMO_MAX_LENGTH) errors.push(MEMO_TOO_LONG_MESSAGE);
  }
  return errors;
}

/**
 * 편집기 선택칸에 보일 값 — 원본이 허용값이 아니면(빠진 경우 포함) 빈 값(「선택하세요」)이다.
 * 바로잡힌 값(readMemoConfig)을 그대로 보이면 사용자가 틀린 설정을 알아채지 못하고, 같은 값을 다시 골라 고칠 수도 없다.
 */
export function readMemoChoices(raw: unknown): { scope: MemoScope | ""; format: MemoFormat | "" } {
  const r = isRecord(raw) ? raw : {};
  return { scope: isMemoScope(r.scope) ? r.scope : "", format: isMemoFormat(r.format) ? r.format : "" };
}

/* ------------------------------------------------------------------ 글자 수 */

/** 편집 중인 글 검사 — 통과면 null, 아니면 문구. 빈 글은 허용한다(메모를 비운다). */
export function validateDraft(content: string): string | null {
  return content.length > MEMO_MAX_LENGTH ? MEMO_TOO_LONG_MESSAGE : null;
}

/** 글자 수 표시 — 「1,234 / 20,000자」. */
export function countLabel(content: string): string {
  return `${content.length.toLocaleString("ko-KR")} / ${MEMO_MAX_LENGTH.toLocaleString("ko-KR")}자`;
}

export function canSave(content: string, busy: boolean): boolean {
  return !busy && validateDraft(content) === null;
}

/* ------------------------------------------------------------------ 개인 메모 레코드 */

export interface MemoRecord {
  instId: string;
  defId: string;
  format: MemoFormat;
  content: string;
  /** 마지막 저장 시각(서버 `U_AT`). 없으면 null. */
  updatedAt: string | null;
}

/** 서버의 memo → 화면 값. 객체가 아니면 null(메모 없음). 모르는 형식은 text 로 본다. */
export function parseMemo(raw: unknown): MemoRecord | null {
  if (!isRecord(raw)) return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    instId: str(raw.instId),
    defId: str(raw.defId),
    format: isMemoFormat(raw.format) ? raw.format : "text",
    content: str(raw.content),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : null,
  };
}

/** 보기 모드에서 「메모가 없습니다」를 보일지 — 메모가 없거나 내용이 공백뿐이다. */
export function isBlankMemo(memo: MemoRecord | null): boolean {
  return memo === null || memo.content.trim() === "";
}

/* ------------------------------------------------------------------ 임시 저장(쓰다 만 글) */

/**
 * 임시 저장 키 접두(훑기 대상) — 이 접두의 키는 모두 이 기능이 쓴다. 이 브라우저를 쓰는 사람 전용 편의 기능이다(localStorage).
 * 실제 키는 `dmes:widget:memo-draft:v1:{encodeURIComponent(userId)}:{encodeURIComponent(instanceId)}` — `:` 가 ID 에 들어 있어도
 * (사용자 a:b + 칸 c) 와 (사용자 a + 칸 b:c) 가 같은 키가 되지 않는다.
 */
export const MEMO_DRAFT_KEY_PREFIX = "dmes:widget:memo-draft:";
const MEMO_DRAFT_KEY_VERSION = "v1";
/** 글·형식이 바뀐 뒤 임시 저장에 쓰기까지 기다리는 시간(밀리초). */
export const MEMO_DRAFT_DELAY_MS = 300;
/** 임시본 보관 기간 — 마지막으로 글이 바뀐 시각(savedAt)부터 7일. 로그아웃해도 이 브라우저에 평문으로 남으므로 오래 두지 않는다. */
export const MEMO_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEMO_DRAFT_FLAG_TEXT = "쓰다 만 글 있음";

/** 한 사용자의 임시본 키가 모두 가지는 접두 — 사용자를 모르면 null. encodeURIComponent 가 던지는 ID(짝 없는 서로게이트)도 null. */
export function memoDraftUserPrefix(userId: string): string | null {
  if (!userId) return null;
  try {
    return `${MEMO_DRAFT_KEY_PREFIX}${MEMO_DRAFT_KEY_VERSION}:${encodeURIComponent(userId)}:`;
  } catch {
    return null;
  }
}

/** 사용자·칸 중 하나라도 모르면 null — 임시 저장하지 않는다(읽지도 쓰지도 않는다). */
export function memoDraftKey(userId: string, instanceId: string): string | null {
  const prefix = memoDraftUserPrefix(userId);
  if (!prefix || !instanceId) return null;
  try {
    return `${prefix}${encodeURIComponent(instanceId)}`;
  } catch {
    return null;
  }
}

/**
 * 현재 사용자 확인 상태 — pending: 아직 확인 중, confirmed: 사용자 ID 를 알았다, failed: 확인이 끝났는데 ID 가 없다(조회 실패).
 * shared 의 RBAC 상태는 isLoading 으로 끝났는지를, userId 로 알았는지를 말한다(RBAC 조회만 실패해도 userId 는 있다 — confirmed).
 */
export type MemoUserStatus = "pending" | "confirmed" | "failed";

export function memoUserStatus(state: { isLoading: boolean; userId: string }): MemoUserStatus {
  if (state.isLoading) return "pending";
  return state.userId ? "confirmed" : "failed";
}

/** 임시 저장본 — base 는 이 글을 쓰기 시작할 때 불러온 서버 메모의 내용 해시(memoBaseHash)다. */
export interface MemoDraft {
  format: MemoFormat;
  content: string;
  baseHash: string;
  /** 마지막으로 글이 바뀐 시각(epoch 밀리초). */
  savedAt: number;
}

/** 임시 저장본에 쓸 수 있는 글인가 — 20,000자 상한은 임시본도 같다. */
export function isDraftWritable(content: string): boolean {
  return content.length <= MEMO_MAX_LENGTH;
}

/** 문자열 해시(cyrb53) — 충돌이 드문 53비트. 서버 메모 변경 감지용이라 암호학적 강도는 필요 없다. */
function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 서버 메모 한 벌을 가리키는 값(형식·내용 해시) — 메모가 아직 없으면 "none". updatedAt 이 아니라 내용으로 본다:
 * 저장 응답과 불러오기 응답의 시각 모양이 달라도 「다른 곳에서 바뀜」으로 잘못 보지 않는다.
 */
export function memoBaseHash(memo: Pick<MemoRecord, "format" | "content"> | null): string {
  return memo ? `${memo.format}:${memo.content.length}:${hashText(memo.content)}` : "none";
}

export const serializeDraft = (draft: MemoDraft): string => JSON.stringify(draft);

/** 저장소 문자열 → 임시 저장본. JSON 이 아니거나 모양·형식·길이가 맞지 않으면 null(없는 것으로 본다). */
export function parseDraft(raw: string | null): MemoDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { format, content, baseHash, savedAt } = value;
  if (!isMemoFormat(format) || typeof content !== "string" || !isDraftWritable(content)) return null;
  if (typeof baseHash !== "string" || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  return { format, content, baseHash, savedAt };
}

/** 임시본이 보관 기간(7일)을 넘겼는가 — savedAt 으로부터 정확히 7일까지는 살아 있다. */
export function isDraftExpired(draft: Pick<MemoDraft, "savedAt">, now: number): boolean {
  return now - draft.savedAt > MEMO_DRAFT_TTL_MS;
}

/**
 * 저장소 항목 하나를 훑을 때 지워야 하는가 — 이 기능의 키(접두)가 아니면 건드리지 않는다. 접두는 같지만 이 사용자의 키(ownPrefix)가 아니면
 * (다른 사용자·옛 모양 키) 지운다. 이 사용자의 것은 쓸 수 없는 값(깨짐·20,000자 초과)이거나 만료됐을 때만 지운다.
 */
export function isStaleDraftEntry(key: string, raw: string | null, ownPrefix: string, now: number): boolean {
  if (!key.startsWith(MEMO_DRAFT_KEY_PREFIX)) return false;
  if (!key.startsWith(ownPrefix)) return true;
  const draft = parseDraft(raw);
  return draft === null || isDraftExpired(draft, now);
}

/** 임시본이 비교 대상(서버 메모, 메모가 없으면 처음 형식·빈 글)과 다른 글인가 — 형식만 다르고 글이 비었으면 쓰다 만 글이 아니다. */
export function draftDiffers(draft: Pick<MemoDraft, "format" | "content">, base: Pick<MemoDraft, "format" | "content">): boolean {
  if (draft.content !== base.content) return true;
  return draft.format !== base.format && draft.content.trim() !== "";
}

/** 편집을 시작할 때의 기준 — 서버 메모(없으면 처음 형식·빈 글)의 형식·내용과 그 해시. */
export interface MemoEditBase {
  format: MemoFormat;
  content: string;
  hash: string;
}

export function memoEditBase(memo: MemoRecord | null, initialFormat: MemoFormat): MemoEditBase {
  return { format: memo?.format ?? initialFormat, content: memo?.content ?? "", hash: memoBaseHash(memo) };
}

/** 편집을 시작할 때 되살릴 임시본 — 기준과 다른 글일 때만. changedElsewhere: 임시본을 만든 뒤 서버 메모가 바뀌었다. */
export interface RestorableDraft {
  draft: MemoDraft;
  changedElsewhere: boolean;
}

export function restorableDraft(draft: MemoDraft | null, base: MemoEditBase): RestorableDraft | null {
  if (!draft || !draftDiffers(draft, base)) return null;
  return { draft, changedElsewhere: draft.baseHash !== base.hash };
}

/**
 * 보기 모드에서 임시본의 상태 — pending: 서버 메모와 다른 쓰다 만 글(표시 대상), stale: 서버 메모와 같아져 쓸모없는 임시본(지운다).
 * 저장 응답을 못 받고 위젯이 내려갔어도 서버에 저장되어 있었다면 stale 이 된다.
 */
export function classifyDraft(
  draft: MemoDraft | null,
  memo: MemoRecord | null,
  initialFormat: MemoFormat
): { pending: MemoDraft | null; stale: boolean } {
  if (!draft) return { pending: null, stale: false };
  const differs = draftDiffers(draft, memoEditBase(memo, initialFormat));
  return differs ? { pending: draft, stale: false } : { pending: null, stale: true };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 안내에 보일 시각 — 브라우저 지역 시각 「yyyy-MM-dd HH:mm」. */
export function formatDraftTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const MEMO_DRAFT_CHANGED_TEXT = "그 뒤 다른 곳에서 메모가 바뀌었습니다";

/** 편집 영역 위 안내 문구 — 「저장하지 않은 글이 있습니다(시각)」(+ 서버 메모가 그 뒤 바뀌었으면 한 문장 더). */
export function memoDraftNoticeText(savedAt: number, changedElsewhere: boolean): string {
  const head = `저장하지 않은 글이 있습니다(${formatDraftTime(savedAt)})`;
  return changedElsewhere ? `${head}. ${MEMO_DRAFT_CHANGED_TEXT}.` : head;
}

/* ------------------------------------------------------------------ 미리보기 판정 */

/** 위젯관리 화면 미리보기(WidgetPreview)가 쓰는 자리표시 값 — 저장 전 정의의 widgetId 와 모든 미리보기의 instId. */
export const PREVIEW_WIDGET_ID = "def.preview";
export const PREVIEW_INST_ID = "preview";

/**
 * 서버와 실제로 주고받는지 — 저장된 정의(`def.…`)를 홈 등에 놓은 위젯만 그렇다. 관리 화면 미리보기(instId `preview`,
 * 저장 전이면 widgetId `def.preview` 나 빈 값)는 서버를 부르지 않는다. 서버는 `preview` 인스턴스에 메모를 만들 수 없고
 * 저장 전 정의는 `save` 검사(사용 중인 memo 정의)를 통과하지 못한다.
 */
export function isLiveMemo(widgetId: string, instanceId?: string): boolean {
  if (!/^def\./.test(widgetId) || widgetId === PREVIEW_WIDGET_ID) return false;
  return instanceId !== PREVIEW_INST_ID;
}

/* ------------------------------------------------------------------ 요청·응답 */

export interface MemoRequest {
  url: string;
  body: { meta: { menuId: string }; params: Record<string, unknown> };
}

/**
 * params 에서 null·undefined 값을 뺀다. cactus 요청 변환기는 params 값마다 TypedObject 를 만드는데
 * null 이면 IllegalArgumentException 으로 요청 전체가 실패한다. 빈 글(`""`)은 값이므로 남긴다.
 */
export function dropNullParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

const memoRequest = (action: string, params: Record<string, unknown>): MemoRequest => ({
  url: `${MEMO_BASE}/${action}`,
  body: { meta: { menuId: MEMO_MENU_ID }, params: dropNullParams(params) },
});

/** userId 는 보내지 않는다 — 서버가 인증 컨텍스트로만 채운다(스펙 §17.3). */
export const loadRequest = (instId: string): MemoRequest => memoRequest("load", { instId });

export interface SaveInput {
  instId: string;
  defId: string;
  format: MemoFormat;
  content: string;
}

export const saveRequest = (input: SaveInput): MemoRequest =>
  memoRequest("save", { instId: input.instId, defId: input.defId, format: input.format, content: input.content });

/** 서버가 업무 규칙으로 거절한 오류(HTTP 200 + meta.success=false). 메시지는 서버가 쓴 한국어 문장이다. */
export class MemoServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoServiceError";
  }
}

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

/** 응답 봉투 해제 — csa 화면 api.ts 와 같은 규칙: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows. */
export function unwrapMemo(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope | null;
  if (env?.meta && env.meta.success === false) {
    throw new MemoServiceError(env.meta.message?.trim() || "요청이 거부되었습니다.");
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
export function memoErrorMessage(err: unknown, fallback: string): string {
  return err instanceof MemoServiceError && err.message ? err.message : fallback;
}
