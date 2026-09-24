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

/**
 * @param effStdAstJson 목록·상세·execute 응답의 유효 표준 AST(JSON 문자열)
 * @param value         입력값(문자열)
 * @param dataType      유효 데이터 타입
 */
export function previewStandard(effStdAstJson: string | null | undefined, value: string, dataType: string | null | undefined): PreviewResult {
  if (!effStdAstJson || value === undefined || value === null || value.trim() === "") return result("none");
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
