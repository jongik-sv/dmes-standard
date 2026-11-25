/**
 * mqc OASIS 호출 공통 — `POST /api/mqc/oasis/{serviceId}/{action}`. 봉투 해제·거부 판정은 shared `callOasisAt` 이 한다.
 * 화면 전용 서비스는 serviceId 를 화면 objectId 와 같게 둔다(docs/mqc/demo/README.md §2). 권한키는 `mqc/{serviceId}/{action}`.
 *
 * 쓰는 법:
 *   const out = await callOasis<{ rows: Order[] }>("qcdOrder", "search", { orderNo });
 *   catch (e) { showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }) }
 *
 * params 에 배열을 넣지 않는다(OASIS "Generic type" 오류). 배열은 쉼표 문자열로 보내거나 `grids` 로 싣는다.
 */
import {
  callOasisAt,
  type OasisCallOptions,
  type OasisGrids,
} from "@dk-oasis/shared/http";

export const MQC_OASIS_BASE = "/api/mqc/oasis";

export interface CallOasisOptions extends OasisCallOptions {
  /** 배열 데이터 — `grids.<이름>.rows`. */
  grids?: OasisGrids;
}

/** mqc OASIS 서비스 호출. 결과는 `data` + `data.result` 를 편 객체다. 업무 거부(meta.success=false)는 오류로 던진다. */
export function callOasis<T = Record<string, unknown>>(
  serviceId: string,
  action: string,
  params: object = {},
  options: CallOasisOptions = {},
): Promise<T> {
  const { grids, ...rest } = options;
  return callOasisAt<T>(MQC_OASIS_BASE, serviceId, action, params, grids, rest);
}

/** 기본 오류 문장 — 원인을 모를 때. */
export const DEFAULT_ERROR_MESSAGE =
  "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도하세요.";

/** 예외 원문처럼 보이는 글(예외 클래스 이름·스택·패키지 경로) — 본문에 싣지 않는다(Local-Rules §13). */
const RAW_ERROR =
  /(Exception\b|\w+Error:|\n\s*at [\w$.]+\(|\b(java|javax|kr|com|org)\.[a-z]+\.)/;

/**
 * 화면에 보일 오류 문장. 서버가 준 업무 문장(OASIS meta.message, HTTP 오류 본문)은 그대로 쓰고,
 * 엔진·예외 원문으로 보이면 기본 문장으로 바꾼다.
 */
export function errorMessage(
  e: unknown,
  fallback: string = DEFAULT_ERROR_MESSAGE,
): string {
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const trimmed = text.trim();
  if (trimmed === "" || RAW_ERROR.test(trimmed)) return fallback;
  return trimmed;
}
