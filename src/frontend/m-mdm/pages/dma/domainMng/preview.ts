/**
 * 표준식 화면 미리보기(design.md §3.5 첫 행, 불변 I14) — 서버가 준 **유효 표준 AST** 를 TSK-03-04 JS 평가기로 즉시 평가한다.
 * 비즈니스식은 여기서 평가하지 않는다(서버 전용). 화면이 판정할 수 없으면(MASTER 등) "서버 확인" — 서버가 기준이다(02:362).
 */
import { convertForType, validate } from "@/evalex";
import type { AstNode, DataType } from "@/contract/engine-contract.generated";

export type PreviewStatus = "pass" | "fail" | "server" | "error" | "none";

export interface PreviewResult {
  status: PreviewStatus;
  label: string;
  detail?: string;
}

const LABEL: Record<PreviewStatus, string> = {
  pass: "표준 통과",
  fail: "표준 실패",
  server: "서버 확인",
  error: "판정 오류",
  none: "-",
};

function result(status: PreviewStatus, detail?: string): PreviewResult {
  return { status, label: LABEL[status], ...(detail ? { detail } : {}) };
}

/** 유효 길이·소수 자리수. 서버 판정기(DomainLengthCheck)와 같은 규칙이다. */
export interface LengthLimit {
  length?: number | null;
  scale?: number | null;
}

/**
 * 길이·자리수 위반 문구. 위반이 없으면 null.
 *  - STRING: 글자 수 > 길이
 *  - NUMBER: 정수 자리수 > 길이 − 소수 자리수, 또는(소수 자리수가 정해져 있으면) 소수 자리수 > 소수 자리수
 */
export function lengthViolation(value: string, dataType: string | null | undefined, limit: LengthLimit | undefined): string | null {
  const length = limit?.length;
  if (length == null || length <= 0 || value == null || value.trim() === "") return null;
  const type = (dataType ?? "STRING").toUpperCase();
  if (type === "STRING") {
    const n = Array.from(value).length;
    return n > length ? `길이 초과: ${n}자 > ${length}자` : null;
  }
  if (type === "NUMBER") {
    const m = /^[+-]?(\d*)(?:\.(\d*))?$/.exec(value.trim());
    if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
    const whole = m[1].replace(/^0+/, "").length;
    const frac = (m[2] ?? "").replace(/0+$/, "").length;
    const scale = limit?.scale ?? null;
    const wholeMax = Math.max(length - (scale ?? 0), 0);
    if (whole > wholeMax) return `정수 자리수 초과: ${whole}자리 > ${wholeMax}자리`;
    if (scale != null && frac > scale) return `소수 자리수 초과: ${frac}자리 > ${scale}자리`;
  }
  return null;
}

/**
 * @param effStdAstJson 목록·상세·execute 응답의 유효 표준 AST(JSON 문자열)
 * @param value         입력값(문자열)
 * @param dataType      유효 데이터 타입
 * @param limit         유효 길이·소수 자리수. 넘으면 식과 상관없이 표준 실패
 */
export function previewStandard(effStdAstJson: string | null | undefined, value: string, dataType: string | null | undefined,
  limit?: LengthLimit): PreviewResult {
  if (value === undefined || value === null || value.trim() === "") return result("none");
  const over = lengthViolation(value, dataType, limit);
  if (over) return { status: "fail", label: over };
  if (!effStdAstJson) return result("none");
  let ast: AstNode;
  try {
    ast = JSON.parse(effStdAstJson) as AstNode;
  } catch {
    return result("error", "AST 를 읽을 수 없습니다");
  }
  let converted;
  try {
    converted = convertForType(value, (dataType ?? "STRING") as DataType);
  } catch (e) {
    return result("error", e instanceof Error ? e.message : String(e));
  }
  const out = validate(ast, { value: converted });
  switch (out.kind) {
    case "value":
      return result(out.value === true ? "pass" : "fail");
    case "fallback":
      return result("server", out.reason);
    default:
      return result("error", out.message);
  }
}
