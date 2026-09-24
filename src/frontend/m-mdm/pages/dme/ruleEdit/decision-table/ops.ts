/**
 * op 코드·표기와 열별 op 목록(TSK-08-02 design I18, 06:310).
 *
 * 목록 순서는 06 원문 순서 그대로다. 최근 쓴 op 를 위로 올리지 않는다(자리가 흔들리면 잘못 고른다).
 * 1 타입: String 9 · Number 11 · 일자(일자 String·DATE) 11 · 코드 도메인 String 10(+IN 카테고리) · Boolean 4.
 * 2 타입: 그 변수의 1 타입 목록 끝에 구간 넷. Equal·Expression 조건 열과 결과 열은 목록이 없다.
 */
import type { ResolvedVar } from "../types";

export const RANGE_OPS = ["<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <"] as const;
export const NO_VALUE_OPS = ["NA", "IS_NULL", "NOT_NULL"] as const;
export const LIST_OPS = ["IN", "NOT_IN"] as const;

export const OP_LABELS: Record<string, string> = {
  NA: "-",
  EQ: "=",
  NE: "<>",
  LT: "<",
  LE: "<=",
  GT: ">",
  GE: ">=",
  IN: "IN",
  NOT_IN: "NOT IN",
  CODE_IN: "IN 카테고리",
  CONTAINS: "CONTAINS",
  INSTR: "INSTR",
  IS_NULL: "IS NULL",
  NOT_NULL: "IS NOT NULL",
  "<= 변수 <=": "<= 변수 <=",
  "<= 변수 <": "<= 변수 <",
  "< 변수 <=": "< 변수 <=",
  "< 변수 <": "< 변수 <",
};

const STRING_OPS = ["NA", "EQ", "NE", "IN", "NOT_IN", "CONTAINS", "INSTR", "IS_NULL", "NOT_NULL"];
const CODE_STRING_OPS = ["NA", "EQ", "NE", "IN", "NOT_IN", "CODE_IN", "CONTAINS", "INSTR", "IS_NULL", "NOT_NULL"];
const ORDERED_OPS = ["NA", "EQ", "NE", "LT", "LE", "GT", "GE", "IN", "NOT_IN", "IS_NULL", "NOT_NULL"];
const BOOLEAN_OPS = ["NA", "EQ", "IS_NULL", "NOT_NULL"];

export function isRangeOp(op: string | undefined): boolean {
  return !!op && (RANGE_OPS as readonly string[]).includes(op);
}

export function isNoValueOp(op: string | undefined): boolean {
  return !!op && (NO_VALUE_OPS as readonly string[]).includes(op);
}

export function isListOp(op: string | undefined): boolean {
  return !!op && (LIST_OPS as readonly string[]).includes(op);
}

/** 1 타입 목록(데이터 타입으로 줄어든다). */
function singleOps(v: ResolvedVar): string[] {
  if (v.dataType === "BOOLEAN") return BOOLEAN_OPS;
  if (v.dataType === "NUMBER" || v.dataType === "DATE" || v.dateString) return ORDERED_OPS;
  if (v.maruCodeId) return CODE_STRING_OPS;
  return STRING_OPS;
}

/** 조건 열의 op 드롭다운. DISP_TYPE 이 비면 1 타입으로 본다(서버 변환기와 같다). */
export function opsFor(v: ResolvedVar): string[] {
  if (v.varKind !== "COND") return [];
  const disp = v.dispType ?? "1";
  if (disp === "1") return [...singleOps(v)];
  if (disp === "2") return [...singleOps(v), ...RANGE_OPS];
  return [];
}
