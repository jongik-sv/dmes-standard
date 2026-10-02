import type { CellJson, CodeSets, EngineWarning, ErrorCode } from "./engine-contract.generated";
import { evaluateCell, type CellVariable } from "./cell-compare";
import { EvalexError } from "./errors";
import { alwaysNames } from "./input-contract";
import { checkRecordKeys, evaluate, prepare, usedVariables, type Scope } from "./interpreter";
import {
  condVars,
  defaultRow,
  effectivePolicy,
  isExpressionColumn,
  isExprVar,
  normalRows,
  varKey,
  type RuleDef,
  type RuleRowDef,
  type RuleVarDef,
} from "./rule-model";
import { convertForType, type EvalValue } from "./values";

/**
 * 적중 정책 미리보기(TSK-03-04 design §6.9). 서버 판정(TSK-03-03 `RuleEvaluator`·`ResultAggregator`)의 행 고르기를 화면에서
 * 즉시 보여 준다. 결과 값 계산·집계는 서버 값 테스트 몫이다. 판정할 수 없는 셀이 결론을 바꾸면 서버로 폴백한다.
 */
export interface RowPreview {
  rowId: number;
  seq: number;
  evaluated: boolean;
  hit: boolean | null;
  firstFalseVarId: number | null;
  fallbackVarIds: number[];
}

export type RulePreview =
  | { kind: "ok"; hits: { rowId: number; seq: number }[]; defaultApplied: boolean; trace: RowPreview[]; warnings: EngineWarning[] }
  | { kind: "error"; code: ErrorCode; rowIds: number[]; message: string }
  | { kind: "fallback"; trace: RowPreview[]; warnings: EngineWarning[]; reason: string };

export interface PreviewOptions {
  codeSets?: CodeSets;
  /** 정규식형 `=` 패턴 셀의 서버 정규식. 키는 `${rowId}:${varId}`. */
  patternRegex?: Record<string, string>;
}

/** 룰 객체마다 한 번 만드는 준비물(design §6.13 성능). */
interface Prepared {
  conds: { v: RuleVarDef; cellVar: CellVariable; key: string; exprVar: boolean; expression: boolean; refs: string[] }[];
  always: string[];
  rows: RuleRowDef[];
  hasDefault: boolean;
}

const preparedRules = new WeakMap<RuleDef, Prepared>();

function prepareRule(rule: RuleDef): Prepared {
  let p = preparedRules.get(rule);
  if (p) return p;
  p = {
    conds: condVars(rule).map((v) => {
      const key = varKey(v);
      const dataType = v.dataType === "DATE" ? "STRING" : v.dataType;
      return {
        v,
        key,
        exprVar: isExprVar(v),
        expression: isExpressionColumn(v),
        refs: isExprVar(v) ? (v.refVars ?? usedVariables(v.exprAst!)).map((n) => n.toUpperCase()) : [],
        cellVar: {
          name: key,
          dataType,
          dateString: v.dateString || v.dataType === "DATE",
          maruCodeId: v.maruCodeId ?? undefined,
        },
      };
    }),
    always: alwaysNames(rule),
    rows: normalRows(rule),
    hasDefault: defaultRow(rule) !== undefined,
  };
  preparedRules.set(rule, p);
  return p;
}

class PreviewError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type CellResult = true | false | null;

export function previewRule(rule: RuleDef, record: Record<string, EvalValue | number>, opts: PreviewOptions = {}): RulePreview {
  const p = prepareRule(rule);
  const keys = Object.keys(record);

  // 1. 조건 검사 — 예약 키, 입력 계약 키(대소문자 구분 정확 일치), 조건 변수 선언 타입 변환.
  const bad = checkRecordKeys(keys);
  if (bad) return { kind: "error", code: bad.code, rowIds: [], message: `예약된 레코드 키: ${bad.key}` };
  const missing = p.always.filter((n) => !Object.prototype.hasOwnProperty.call(record, n));
  if (missing.length) return { kind: "error", code: "MISSING_KEY", rowIds: [], message: `레코드에 없는 키: ${missing.join(", ")}` };

  let scope: Scope;
  const colValue = new Map<number, EvalValue>();
  const fallbackCols = new Set<number>();
  try {
    scope = prepare(record);
    for (const c of p.conds) {
      if (c.expression || c.exprVar || !c.v.varName) continue;
      const v = convertForType(record[c.v.varName] ?? null, c.v.dataType);
      colValue.set(c.v.varId, v);
      scope[c.v.varName.toUpperCase()] = v;
    }
    for (const c of p.conds) {
      if (!c.exprVar) continue;
      if (c.refs.some((n) => scope[n] === null)) {
        colValue.set(c.v.varId, null);
      } else {
        const out = evaluate(c.v.exprAst!, scope, { codeSets: opts.codeSets });
        if (out.kind === "fallback") fallbackCols.add(c.v.varId);
        else if (out.kind === "error") throw new PreviewError(out.code === "MISSING_KEY" ? "MISSING_KEY" : "EVALUATION_ERROR", out.message);
        else colValue.set(c.v.varId, convertForType(out.value, c.v.dataType));
      }
      scope[c.key.toUpperCase()] = colValue.get(c.v.varId) ?? null;
    }
  } catch (e) {
    if (e instanceof EvalexError || e instanceof PreviewError) return { kind: "error", code: e.code, rowIds: [], message: e.message };
    return { kind: "error", code: "EVALUATION_ERROR", rowIds: [], message: String(e) };
  }

  const warnings: EngineWarning[] = [];

  // 2. 행 고르기 — 조건 셀을 열 seq 순으로 AND. 처음 거짓에서 멈추고, 판정 불가 셀은 뒤에 확정 거짓이 없을 때만 행을 판정 불가로 둔다.
  const evalRow = (r: RuleRowDef): RowPreview | PreviewError => {
    const trace: RowPreview = { rowId: r.rowId, seq: r.seq, evaluated: true, hit: true, firstFalseVarId: null, fallbackVarIds: [] };
    for (const c of p.conds) {
      const cell: CellJson | undefined = r.cells[c.v.varId];
      if (!cell || ("op" in cell && cell.op === "NA")) continue;
      const res = evalCell(rule, c, cell, r, scope, colValue, fallbackCols, opts, warnings, trace.fallbackVarIds.length > 0);
      if (res instanceof PreviewError) return res;
      if (res === false) {
        trace.hit = false;
        trace.firstFalseVarId = c.v.varId;
        return trace;
      }
      if (res === null) trace.fallbackVarIds.push(c.v.varId);
    }
    if (trace.fallbackVarIds.length) trace.hit = null;
    return trace;
  };

  const skipped = (r: RuleRowDef): RowPreview => ({ rowId: r.rowId, seq: r.seq, evaluated: false, hit: false, firstFalseVarId: null, fallbackVarIds: [] });
  const trace: RowPreview[] = [];

  if (rule.ruleKind === "DERIVE") {
    const [firstRow, ...rest] = p.rows;
    if (!firstRow) return { kind: "ok", hits: [], defaultApplied: p.hasDefault, trace, warnings };
    trace.push({ rowId: firstRow.rowId, seq: firstRow.seq, evaluated: true, hit: true, firstFalseVarId: null, fallbackVarIds: [] });
    rest.forEach((r) => trace.push(skipped(r)));
    return { kind: "ok", hits: [{ rowId: firstRow.rowId, seq: firstRow.seq }], defaultApplied: false, trace, warnings };
  }

  // 3. 정책
  const policy = effectivePolicy(rule);
  const hits: { rowId: number; seq: number }[] = [];
  let undetermined = false;
  for (let i = 0; i < p.rows.length; i++) {
    const r = p.rows[i];
    const t = evalRow(r);
    if (t instanceof PreviewError) return { kind: "error", code: t.code, rowIds: [r.rowId], message: t.message };
    trace.push(t);
    if (t.hit === null) {
      undetermined = true;
      if (policy === "FIRST") {
        p.rows.slice(i + 1).forEach((x) => trace.push(skipped(x)));
        return { kind: "fallback", trace, warnings, reason: `${r.rowId}행을 화면에서 판정할 수 없다` };
      }
    } else if (t.hit) {
      hits.push({ rowId: r.rowId, seq: r.seq });
      if (policy === "FIRST") {
        p.rows.slice(i + 1).forEach((x) => trace.push(skipped(x)));
        break;
      }
    }
  }
  if (policy === "UNIQUE" && hits.length > 1) {
    return { kind: "error", code: "UNIQUE_MULTIPLE_HITS", rowIds: hits.map((h) => h.rowId), message: "UNIQUE 표에서 여러 행이 적중했다" };
  }
  if (undetermined) return { kind: "fallback", trace, warnings, reason: "판정할 수 없는 행이 있다" };

  // 4. 기본 행
  return { kind: "ok", hits, defaultApplied: hits.length === 0 && p.hasDefault, trace, warnings };
}

function evalCell(
  rule: RuleDef,
  c: Prepared["conds"][number],
  cell: CellJson,
  r: RuleRowDef,
  scope: Scope,
  colValue: Map<number, EvalValue>,
  fallbackCols: Set<number>,
  opts: PreviewOptions,
  warnings: EngineWarning[],
  afterUndetermined: boolean,
): CellResult | PreviewError {
  if ("ast" in cell) {
    const out = evaluate(cell.ast, scope, { codeSets: opts.codeSets });
    if (out.kind === "fallback") return null;
    if (out.kind === "error") return afterUndetermined ? null : new PreviewError(out.code, out.message);
    if (out.value === null) {
      warnings.push({ code: "EXPR_CELL_NULL", ruleId: rule.ruleId, rowId: r.rowId, varId: c.v.varId, message: `${r.rowId}행 조건 셀 결과가 NULL 이라 거짓으로 본다` });
      return false;
    }
    if (typeof out.value !== "boolean") {
      return afterUndetermined ? null : new PreviewError("EVALUATION_ERROR", `${r.rowId}행 조건 셀 결과가 불린이 아니다`);
    }
    return out.value;
  }
  if (fallbackCols.has(c.v.varId)) return null;
  const out = evaluateCell(c.cellVar, cell, colValue.get(c.v.varId) ?? null, {
    skipKeyCheck: true,
    codeSets: opts.codeSets,
    patternRegex: opts.patternRegex?.[`${r.rowId}:${c.v.varId}`],
  });
  if (out.kind === "fallback") return null;
  if (out.kind === "error") return afterUndetermined ? null : new PreviewError(out.code, out.message);
  return out.value;
}
