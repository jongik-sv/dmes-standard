/**
 * OASIS 서비스 호출 공통 계약 — `POST {basePath}/{serviceId}/{action}` 의 요청 조립·응답 봉투 해제·거부 판정.
 *
 * OASIS 실행기는 업무 거부(`BusinessException`)를 HTTP 200 + `meta.success=false` 봉투로 돌려주므로 {@link apiRequest} 는
 * 던지지 않는다. 화면이 봉투를 판정해 던져야 하며, 화면마다 따로 쓰던 그 판정을 옵션 조합으로 모은 것이 이 파일이다.
 * 기본값은 m-mdm 공통본(`src/dme/oasis-call.ts`) 동작이고, 옵션으로 다른 화면의 지금 동작을 그대로 재현한다.
 *
 * - 본문: `{ meta:{ menuId }, params, grids? }`. 배열은 params 가 아니라 `grids.<이름>.rows` 로 보낸다(params 배열은
 *   "Generic type" 오류). OASIS 는 params 의 null 값 타입을 정하지 못해 요청 전체가 실패하므로 기본으로 null·undefined 를 뺀다.
 * - 오류: 기본은 {@link OasisCallError}(`code`·`errors`·`field`). 화면이 자기 오류 클래스를 계속 써야 하면 `errorFactory`.
 *
 * ★ 번들 주의 — shared 는 tsup `splitting:false` 라 이 파일을 import 하는 진입점마다 `OasisCallError` 사본이 생겨 `instanceof` 가
 *   깨진다. 그래서 이 파일은 `/http` 진입점에서만 내보내고 shared 의 다른 모듈은 import 하지 않는다. 진입점이 갈라져도 맞게
 *   판정하려면 `instanceof` 대신 {@link isOasisCallError} 를 쓴다.
 */
import { apiRequest } from "./index";

/** OASIS 오류 상세 한 건 — cactus-core `ErrorDetail(grid, rowKey, rowIndex, field, code, message)`. */
export interface CactusErrorDetail {
  grid?: string;
  rowKey?: string | number;
  rowIndex?: number;
  field?: string;
  code?: string;
  message?: string;
}

/** OASIS 응답 봉투 — cactus-core `CactusResponse`. */
export interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
  errors?: CactusErrorDetail[];
}

/** 요청 grids — `{ 이름: { rows } }`. 이름은 서버 메서드 파라미터 이름과 글자 단위로 같아야 한다. */
export type OasisGrids = Record<string, { rows: unknown[] }>;

const OASIS_CALL_ERROR_MARK = "dk-oasis.OasisCallError";

/** 서버가 거부한 OASIS 요청. `code` 는 알 수 있으면 업무 코드(`MDMnnn`)·cactus 코드. */
export class OasisCallError extends Error {
  readonly code: string | null;
  /** 서버 오류 상세(`isUserSentence` 를 주면 사용자 문장인 것만). `toFieldErrors(e, grid)` 가 읽는다. */
  readonly errors: CactusErrorDetail[];
  /** 오류 상세 중 첫 field(있으면). 없으면 속성 자체가 없다. */
  declare readonly field?: string;

  constructor(message: string, code: string | null = null, errors: CactusErrorDetail[] = [], field?: string) {
    super(message);
    this.name = "OasisCallError";
    this.code = code;
    this.errors = errors;
    if (field !== undefined) this.field = field;
    // 진입점이 갈라져 클래스 사본이 둘이어도 isOasisCallError 가 알아보게 전역 심볼 표시를 단다(열거되지 않는다).
    Object.defineProperty(this, Symbol.for(OASIS_CALL_ERROR_MARK), { value: true });
  }
}

/** `instanceof OasisCallError` 대신 쓰는 판정 — 클래스 사본이 달라도 맞다. */
export function isOasisCallError(e: unknown): e is OasisCallError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as Record<symbol, unknown>)[Symbol.for(OASIS_CALL_ERROR_MARK)] === true
  );
}

/**
 * params 에서 뺄 값.
 * - `nullish`(기본): null·undefined
 * - `nullish+empty`: 그리고 빈 문자열(`""`) — 공백 문자열은 남는다
 * - `nullish+blank`: 그리고 공백만 있는 문자열 — 0·false 는 남는다
 * - `none`: 빼지 않는다(null 도 싣는다)
 */
export type OasisOmitMode = "nullish" | "nullish+empty" | "nullish+blank" | "none";

/** params 에서 `mode` 가 정한 값을 뺀 새 객체. */
export function omitParams(params: object, mode: OasisOmitMode = "nullish"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (mode !== "none") {
      if (v === null || v === undefined) continue;
      if (mode === "nullish+empty" && v === "") continue;
      if (mode === "nullish+blank" && typeof v === "string" && v.trim() === "") continue;
    }
    out[k] = v;
  }
  return out;
}

/** 거부 오류를 만드는 함수 — 화면이 자기 오류 클래스를 계속 써야 할 때. */
export type OasisErrorFactory = (
  message: string,
  code: string | null,
  errors: CactusErrorDetail[],
  field: string | undefined,
) => Error;

export interface OasisUnwrapOptions {
  /**
   * 성공 응답 펼치기.
   * - `data+result`(기본): data 전체를 펴고 그 위에 `data.result`(객체일 때)를 덮는다
   * - `result`: `data.result`(객체일 때)만 편다
   */
  merge?: "data+result" | "result";
  /** 응답 `grids.<이름>.rows` 를 결과의 `<이름>` 으로 올린다(rows 가 없으면 빈 배열). 기본 false. */
  includeGrids?: boolean;
  /**
   * 거부 문구에 errors[] 를 붙이는 방식. 붙이면 `base\n- 항목\n- 항목` 이다. message 가 없거나 빈·공백인 항목은 field 가
   * 있어도 어느 방식이든 붙이지 않는다(오류의 `errors`·`field` 에는 그대로 남는다).
   * - `append-dedup`(기본): 빈 항목과 base 와 같은 항목은 뺀다
   * - `append`: 빈 항목만 뺀다(base 와 같아도 남는다)
   * - `none`: 붙이지 않는다(`meta.message` 만)
   */
  details?: "append-dedup" | "append" | "none";
  /**
   * 사용자에게 보여도 되는 문장인가(예외·SQL 원문 차단). 주면 `meta.message` 가 이 판정에 걸리지 않을 때 기본 문구를 쓰고,
   * errors[] 도 message 가 이 판정을 지나는 것만 문구에 붙이고 오류의 `errors` 로 싣는다.
   */
  isUserSentence?: (text: string) => boolean;
  /**
   * field 코드 → 화면 항목명. 주면 항목명이 있을 때만 `항목명: 글`, 없으면 글만 쓴다.
   * 주지 않으면 field 가 있을 때 `field: 글` 이다.
   */
  fieldLabel?: (field: string) => string | undefined;
  /** 거부 오류를 만드는 함수. 기본은 {@link OasisCallError}. */
  errorFactory?: OasisErrorFactory;
  /** `meta.message` 가 비었을 때(또는 `isUserSentence` 에 걸렸을 때) 쓰는 문구. 기본 "요청이 거부되었습니다.". */
  defaultMessage?: string;
}

const DEFAULT_REJECT_MESSAGE = "요청이 거부되었습니다.";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * OASIS 응답 봉투 해제. `meta.success === false` 면 거부 오류를 던지고, 아니면 `merge`·`includeGrids` 대로 편 결과를 돌려준다.
 */
export function unwrapOasis<T = Record<string, unknown>>(res: unknown, options: OasisUnwrapOptions = {}): T {
  const env = res as CactusEnvelope | null | undefined;
  if (env?.meta && env.meta.success === false) {
    throw rejectionOf(env, options);
  }
  const out: Record<string, unknown> = {};
  if ((options.merge ?? "data+result") === "data+result") {
    if (env?.data) {
      Object.assign(out, env.data);
      const inner = env.data["result"];
      if (isPlainObject(inner)) Object.assign(out, inner);
    }
  } else {
    const inner = env?.data?.["result"];
    if (isPlainObject(inner)) Object.assign(out, inner);
  }
  if (options.includeGrids && env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out as T;
}

function rejectionOf(env: CactusEnvelope, options: OasisUnwrapOptions): Error {
  const defaultMessage = options.defaultMessage ?? DEFAULT_REJECT_MESSAGE;
  const isUser = options.isUserSentence;
  const metaMessage = env.meta?.message;
  const base = isUser
    ? typeof metaMessage === "string" && isUser(metaMessage)
      ? metaMessage.trim()
      : defaultMessage
    : metaMessage?.trim() || defaultMessage;

  const all = env.errors ?? [];
  const kept = isUser ? all.filter((e) => typeof e.message === "string" && isUser(e.message)) : all;

  const mode = options.details ?? "append-dedup";
  const details =
    mode === "none"
      ? []
      : kept
          .map((e) => detailText(e, options.fieldLabel))
          .filter((m): m is string => (mode === "append" ? !!m : !!m && m !== base));
  const message = details.length > 0 ? `${base}\n- ${details.join("\n- ")}` : base;

  const code = env.meta?.code ?? all.find((e) => e.code)?.code ?? null;
  const field = all.find((e) => e.field)?.field;
  const factory = options.errorFactory ?? ((m, c, errs, f) => new OasisCallError(m, c, errs, f));
  return factory(message, code, kept, field);
}

/** 상세 한 건의 문구. message 가 없거나 빈·공백이면 field 가 있어도 붙이지 않는다(`field: undefined` 방지). 글은 다듬지 않는다. */
function detailText(e: CactusErrorDetail, fieldLabel: OasisUnwrapOptions["fieldLabel"]): string | undefined {
  if (e.message == null || String(e.message).trim() === "") return undefined;
  if (fieldLabel) {
    const label = e.field ? fieldLabel(e.field) : undefined;
    return label ? `${label}: ${e.message}` : e.message;
  }
  return e.field ? `${e.field}: ${e.message}` : e.message;
}

export interface OasisCallOptions extends OasisUnwrapOptions {
  /** params 에서 뺄 값. 기본 `nullish`. */
  omit?: OasisOmitMode;
  /** fetch 취소 신호(디바운스 취소 등). */
  signal?: AbortSignal;
  /** `meta.menuId`. 기본은 serviceId — 다른 서비스를 화면 메뉴 권한으로 부를 때 화면 ID 를 준다. */
  menuId?: string;
}

/**
 * OASIS 서비스 호출 — `POST ${basePath}/${serviceId}/${action}`, 본문 `{ meta:{menuId}, params, grids? }`.
 *
 * @param basePath 예: `/api/mdm/oasis`, `/api/mls/oasis`
 * @param grids 주면 그대로 싣는다(빈 객체도 싣는다). 주지 않으면 본문에 grids 키가 없다.
 */
export async function callOasisAt<T = Record<string, unknown>>(
  basePath: string,
  serviceId: string,
  action: string,
  params: object,
  grids?: OasisGrids,
  options: OasisCallOptions = {},
): Promise<T> {
  const res = await apiRequest<unknown>(`${basePath}/${serviceId}/${action}`, {
    method: "POST",
    body: JSON.stringify({
      meta: { menuId: options.menuId ?? serviceId },
      params: omitParams(params, options.omit),
      ...(grids ? { grids } : {}),
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return unwrapOasis<T>(res, options);
}
