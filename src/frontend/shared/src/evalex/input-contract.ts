import type { CellJson, InputContract, RowContract, VarType } from "./engine-contract.generated";
import { usedVariables } from "./interpreter";
import { nullSafety } from "./null-safety";
import { condVars, defaultRow, isExpressionColumn, isExprVar, normalRows, resultVars, varKey, type RuleDef, type RuleVarDef } from "./rule-model";

/**
 * 입력 계약(TSK-03-04 design §6.7, 06:202-230). 스키마 `InputContract` 모양이다.
 * always = 조건 열 변수(seq 순) + 식 변수 참조 + Expression 조건 셀 참조 + 열 조건 참조, 룰 결과 변수 제외.
 * rows = NORMAL 행(seq 순) 뒤 DEFAULT 행. 행마다 결과 셀의 필수·선택 변수와 사람이 읽는 조건 요약(cond).
 */

const RANGE_OPS = new Set(["<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <"]);
const DEFAULT_COND = "기본 행";

/** 룰 결과 변수 이름(결과 열 varName ∪ resGrp) — 대문자. */
function resultNames(rule: RuleDef): Set<string> {
  const out = new Set<string>();
  for (const v of resultVars(rule)) {
    if (v.varName) out.add(v.varName.toUpperCase());
    if (v.resGrp) out.add(v.resGrp.toUpperCase());
  }
  return out;
}

function pushUnique(list: string[], seen: Set<string>, name: string, excluded: Set<string>): void {
  const u = name.toUpperCase();
  if (seen.has(u) || excluded.has(u)) return;
  seen.add(u);
  list.push(name);
}

/** 입력 계약 always 의 변수 이름(첫 등장 순). 미리보기의 키 검사도 이 목록을 쓴다. */
export function alwaysNames(rule: RuleDef): string[] {
  const excluded = resultNames(rule);
  const names: string[] = [];
  const seen = new Set<string>();
  const rows = normalRows(rule);
  for (const v of condVars(rule)) {
    if (isExpressionColumn(v)) {
      for (const r of rows) {
        const cell = r.cells[v.varId];
        if (cell && "ast" in cell) for (const n of usedVariables(cell.ast)) pushUnique(names, seen, n, excluded);
      }
    } else if (isExprVar(v)) {
      for (const n of v.refVars ?? usedVariables(v.exprAst!)) pushUnique(names, seen, n, excluded);
    } else if (v.varName) {
      pushUnique(names, seen, v.varName, excluded);
    }
  }
  for (const v of resultVars(rule)) {
    if (v.grpCondAst) for (const n of usedVariables(v.grpCondAst)) pushUnique(names, seen, n, excluded);
  }
  return names;
}

/** 열 표시 이름 N = varName ?? label ?? `_V<varId>`. */
function columnName(v: RuleVarDef): string {
  return v.varName ?? v.label ?? varKey(v);
}

/** TSK-03-03 `CellSummary.of` 를 옮긴 셀 요약(값은 저장 문자열 그대로). */
export function cellSummary(v: RuleVarDef | null, cell: CellJson): string {
  if ("expr" in cell) return cell.expr;
  if ("val" in cell) return cell.val;
  const op = cell.op;
  const left = "left" in cell ? cell.left : "";
  switch (op) {
    case "NA":
      return "-";
    case "EQ":
      return v?.dispType === "EQUAL" ? left : `= ${left}`;
    case "NE":
      return `<> ${left}`;
    case "LT":
      return `< ${left}`;
    case "LE":
      return `<= ${left}`;
    case "GT":
      return `> ${left}`;
    case "GE":
      return `>= ${left}`;
    case "IN":
      return `IN (${cell.list.join(", ")})`;
    case "NOT_IN":
      return `NOT IN (${cell.list.join(", ")})`;
    case "CODE_IN":
      return `IN 카테고리 ${left}`;
    case "CONTAINS":
      return `CONTAINS ${left}`;
    case "INSTR":
      return `INSTR ${left}`;
    case "IS_NULL":
      return "IS NULL";
    case "NOT_NULL":
      return "IS NOT NULL";
  }
  if (RANGE_OPS.has(op)) return `${left} ${op} ${"right" in cell ? cell.right : ""}`;
  return op;
}

/** 조건 셀 요약에 열 이름을 붙인다(06:226-229 의 `PROD_TYPE = COIL` 모양). */
function namedSummary(v: RuleVarDef, cell: CellJson): string {
  const s = cellSummary(v, cell);
  if ("expr" in cell) return s;
  const n = columnName(v);
  if ("op" in cell) {
    if (RANGE_OPS.has(cell.op)) return s.replace("변수", n);
    if (cell.op === "EQ" && v.dispType === "EQUAL") return `${n} = ${s}`;
  }
  return `${n} ${s}`;
}

function condText(rule: RuleDef, cells: Record<number, CellJson>): string {
  const parts: string[] = [];
  for (const v of condVars(rule)) {
    const cell = cells[v.varId];
    if (!cell || ("op" in cell && cell.op === "NA")) continue;
    parts.push(namedSummary(v, cell));
  }
  return parts.length ? parts.join(" · ") : "-";
}

export function computeInputContract(rule: RuleDef, resolveType: (name: string) => VarType): InputContract {
  const type = (name: string): VarType => {
    const t = resolveType(name);
    if (t === undefined || t === null) throw new Error(`변수 ${name} 의 타입을 알 수 없다`);
    return t;
  };
  const excluded = resultNames(rule);
  const results = resultVars(rule);
  const rowContract = (rowId: number, cells: Record<number, CellJson>, cond: string): RowContract => {
    const order: string[] = [];
    const seen = new Set<string>();
    const required = new Set<string>();
    for (const v of results) {
      const cell = cells[v.varId];
      if (!cell || !("ast" in cell)) continue;
      const ns = nullSafety(cell.ast);
      for (const n of [...ns.required, ...ns.optional]) {
        if (excluded.has(n) || seen.has(n)) continue;
        seen.add(n);
        order.push(n);
      }
      for (const n of ns.required) required.add(n);
    }
    return {
      rowId,
      cond,
      required: order.filter((n) => required.has(n)).map(type),
      optional: order.filter((n) => !required.has(n)).map(type),
    };
  };
  const rows = normalRows(rule).map((r) => rowContract(r.rowId, r.cells, condText(rule, r.cells)));
  const dflt = defaultRow(rule);
  if (dflt) rows.push(rowContract(dflt.rowId, dflt.cells, DEFAULT_COND));
  return { always: alwaysNames(rule).map(type), rows };
}
