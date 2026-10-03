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
