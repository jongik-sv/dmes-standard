import type { AstNode, CellJson, DataType } from "../contract/engine-contract.generated";
import { EXPR_VAR_PREFIX } from "./contract-constants";

/**
 * 룰 정의 TS 타입(TSK-03-04 design §6.6). Java `spi.DefinitionLookup.RuleDefinition` 과 같은 이름(camelCase)을 쓰고
 * 화면에 필요한 칸만 둔다. 생성 텍스트(`text`)는 없다.
 */
export type HitPolicy = "FIRST" | "UNIQUE" | "PRIORITY" | "COLLECT" | "ANY";
export type DispType = "EQUAL" | "ONE" | "TWO" | "EXPRESSION" | "VALUE";

export interface RuleVarDef {
  varId: number;
  varKind: "COND" | "RESULT";
  dispType: DispType;
  seq: number;
  /** 식 변수·Expression 조건 열이면 null. */
  varName: string | null;
  /** 식 변수의 표시명. */
  label?: string | null;
  /** 식 변수 AST. */
  exprAst?: AstNode | null;
  /** 식 변수 참조 변수(없으면 usedVariables(exprAst)). */
  refVars?: string[] | null;
  dataType: DataType;
  scale?: number | null;
  domainId?: string | null;
  /** 화면 전용: 일자 String 도메인. */
  dateString?: boolean;
  /** 화면 전용: 코드 도메인의 마루 코드(CODE_IN). */
  maruCodeId?: string | null;
  resGrp?: string | null;
  grpCondAst?: AstNode | null;
}

export interface RuleRowDef {
  rowId: number;
  seq: number;
  rowKind: "NORMAL" | "DEFAULT";
  cells: Record<number, CellJson>;
}

export interface RuleDef {
  ruleId: string;
  ruleKind: "DECISION" | "DERIVE";
  hitPolicy: HitPolicy | null;
  vars: RuleVarDef[];
  rows: RuleRowDef[];
}

/** 조건 열 — seq 순(같으면 varId 순). */
export function condVars(rule: RuleDef): RuleVarDef[] {
  return rule.vars.filter((v) => v.varKind === "COND").sort((a, b) => a.seq - b.seq || a.varId - b.varId);
}

/** 결과 열 — seq 순. */
export function resultVars(rule: RuleDef): RuleVarDef[] {
  return rule.vars.filter((v) => v.varKind === "RESULT").sort((a, b) => a.seq - b.seq || a.varId - b.varId);
}

/** NORMAL 행 — seq 순(같으면 rowId 순). */
export function normalRows(rule: RuleDef): RuleRowDef[] {
  return rule.rows.filter((r) => r.rowKind === "NORMAL").sort((a, b) => a.seq - b.seq || a.rowId - b.rowId);
}

export function defaultRow(rule: RuleDef): RuleRowDef | undefined {
  return rule.rows.find((r) => r.rowKind === "DEFAULT");
}

/** 열의 변수 이름 — varName, 식 변수면 `_V<varId>`. */
export function varKey(v: RuleVarDef): string {
  return v.varName ?? `${EXPR_VAR_PREFIX}${v.varId}`;
}

/** 식 변수 열인가(변수 이름 대신 식으로 값을 만든다). */
export function isExprVar(v: RuleVarDef): boolean {
  return v.varName === null && v.exprAst != null;
}

/** Expression 조건 열인가(셀마다 불린 식). */
export function isExpressionColumn(v: RuleVarDef): boolean {
  return v.varKind === "COND" && v.dispType === "EXPRESSION";
}

/** DECISION 의 hitPolicy null 은 FIRST 로 본다(TSK-03-03 §6.2). */
export function effectivePolicy(rule: RuleDef): HitPolicy {
  return rule.hitPolicy ?? "FIRST";
}
