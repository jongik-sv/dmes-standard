import type { CellJson, CodeSets, ErrorCode } from "./engine-contract.generated";
import { PLAIN_DECIMAL, decimalWithText, isDec, type Dec } from "./decimal";
import { EvalexError, FallbackSignal } from "./errors";
import { compileJavaRegex, indexCodeSets, str } from "./functions";
import { checkRecordKeys } from "./interpreter";
import { PatternRejected, classify, type PatternShape } from "./pattern";
import { convertForType, type EvalValue } from "./values";

/**
 * op-code 셀 직접 비교(TSK-03-04 design §6.5). 서버는 셀을 EvalEx 텍스트로 만들어 평가하고(06 「EvalEx 생성 규칙」),
 * 화면은 셀 구조를 직접 견준다. 두 쪽이 같은 결과를 내는지는 정합성 코퍼스 cell 사례가 확인한다(06:284).
 */
export interface CellVariable {
  name: string;
  dataType: "NUMBER" | "STRING" | "BOOLEAN";
  /** 일자 String(YYYYMMDD·YYYYMM·YYYY) 도메인. */
  dateString?: boolean;
  /** 코드 도메인의 마루 코드(CODE_IN). */
  maruCodeId?: string;
}

export type CellOutcome =
  | { kind: "value"; value: boolean }
  | { kind: "error"; code: ErrorCode; message: string }
  | { kind: "fallback"; reason: string };

export interface CellOptions {
  /** `=` 패턴이 정규식형일 때 서버가 저장 응답으로 준 정규식(06:267). */
  patternRegex?: string;
  codeSets?: CodeSets;
  /** 미리보기처럼 레코드 키를 한 번에 검사한 경우. */
  skipKeyCheck?: boolean;
}

type Lit = Dec | string | boolean;

/** 셀 리터럴을 변수 타입으로 바꾼 준비물(셀 객체마다 한 번). */
interface PreparedCell {
  dataType: CellVariable["dataType"];
  left?: Lit;
  right?: Lit;
  list?: Lit[];
  pattern?: PatternShape;
  rejected?: string;
}

const preparedCells = new WeakMap<CellJson, PreparedCell>();

function literal(raw: string, dataType: CellVariable["dataType"]): Lit {
  if (dataType === "NUMBER") {
    if (!PLAIN_DECIMAL.test(raw)) throw new EvalexError("EVALUATION_ERROR", `숫자 셀 값이 아니다: ${raw}`);
    return decimalWithText(raw);
  }
  if (dataType === "BOOLEAN") {
    const u = raw.toUpperCase();
    if (u !== "TRUE" && u !== "FALSE") throw new EvalexError("EVALUATION_ERROR", `불린 셀 값이 아니다: ${raw}`);
    return u === "TRUE";
  }
  return raw;
}

function prepareCell(cell: CellJson, dataType: CellVariable["dataType"]): PreparedCell {
  let p = preparedCells.get(cell);
  if (p && p.dataType === dataType) return p;
  p = { dataType };
  if ("op" in cell) {
    const op = cell.op;
    const textual = op === "CODE_IN" || op === "CONTAINS" || op === "INSTR";
    if ("left" in cell) p.left = textual ? cell.left : literal(cell.left, dataType);
    if ("right" in cell) p.right = literal(cell.right, dataType);
    if ("list" in cell) p.list = cell.list.map((x) => literal(x, dataType));
    if (op === "EQ" && dataType === "STRING" && "left" in cell) {
      try {
        p.pattern = classify(cell.left);
      } catch (e) {
        if (!(e instanceof PatternRejected)) throw e;
        p.rejected = e.message;
      }
    }
  }
  preparedCells.set(cell, p);
  return p;
}

/** 값 비교(EvalEx `==`, 글자 그대로). */
function same(v: EvalValue, l: Lit): boolean {
  if (isDec(v)) return isDec(l) && v.eq(l);
  return !isDec(l) && v === l;
}

function cmp(v: EvalValue, l: Lit): number {
  if (isDec(v) && isDec(l)) return v.cmp(l);
  if (typeof v === "string" && typeof l === "string") return v < l ? -1 : v > l ? 1 : 0;
  if (typeof v === "boolean" && typeof l === "boolean") return Number(v) - Number(l);
  throw new FallbackSignal("타입이 다른 대소 비교");
}

function matchPattern(v: string, shape: PatternShape, patternRegex: string | undefined): boolean {
  switch (shape.kind) {
    case "exact":
      return v === shape.lit;
    case "prefix":
      return v.startsWith(shape.lit);
    case "suffix":
      return v.endsWith(shape.lit);
    case "infix":
      return v.includes(shape.lit);
    case "regex":
      if (patternRegex === undefined) throw new FallbackSignal("정규식형 패턴인데 서버 정규식(patternRegex)이 없다");
      return compileJavaRegex(patternRegex).test(v);
  }
}

function judge(variable: CellVariable, cell: CellJson, v: EvalValue, p: PreparedCell, opts: CellOptions): boolean {
  if (!("op" in cell)) throw new FallbackSignal("op 가 없는 셀");
  const op = cell.op;
  if (op === "NA") return true;
  if (op === "IS_NULL") return v === null;
  if (op === "NOT_NULL") return v !== null;
  if (v === null) return false;
  switch (op) {
    case "EQ":
      if (p.rejected) throw new EvalexError("EVALUATION_ERROR", p.rejected);
      if (p.pattern) return matchPattern(v as string, p.pattern, opts.patternRegex);
      return same(v, p.left as Lit);
    case "NE":
      return !same(v, p.left as Lit);
    case "LT":
      return cmp(v, p.left as Lit) < 0;
    case "LE":
      return cmp(v, p.left as Lit) <= 0;
    case "GT":
      return cmp(v, p.left as Lit) > 0;
    case "GE":
      return cmp(v, p.left as Lit) >= 0;
    case "IN":
      return (p.list as Lit[]).some((l) => same(v, l));
    case "NOT_IN":
      return (p.list as Lit[]).every((l) => !same(v, l));
    case "CONTAINS":
      return str(v).includes(p.left as string);
    case "INSTR":
      return (p.left as string).includes(str(v));
    case "CODE_IN": {
      const set = opts.codeSets ? indexCodeSets(opts.codeSets).get(`${variable.maruCodeId}|${p.left as string}`) : undefined;
      if (!set) throw new FallbackSignal("CODE_IN: 받아 둔 코드 집합이 없다");
      return set.has(str(v));
    }
    case "<= 변수 <=":
      return cmp(v, p.left as Lit) >= 0 && cmp(v, p.right as Lit) <= 0;
    case "<= 변수 <":
      return cmp(v, p.left as Lit) >= 0 && cmp(v, p.right as Lit) < 0;
    case "< 변수 <=":
      return cmp(v, p.left as Lit) > 0 && cmp(v, p.right as Lit) <= 0;
    case "< 변수 <":
      return cmp(v, p.left as Lit) > 0 && cmp(v, p.right as Lit) < 0;
    default:
      throw new FallbackSignal(`모르는 op ${String(op)}`);
  }
}

/**
 * op-code 셀 하나를 값 하나에 견준다. 순서: 예약 키 → 선언 타입 변환(TYPE_CONVERSION) → op 비교.
 * NA·IS_NULL·NOT_NULL 을 뺀 셀은 NULL 에 거짓이다(가드, 06:181-190).
 */
export function evaluateCell(variable: CellVariable, cell: CellJson, value: EvalValue | number, opts: CellOptions = {}): CellOutcome {
  try {
    if (!opts.skipKeyCheck) {
      const bad = checkRecordKeys([variable.name]);
      if (bad) return { kind: "error", code: bad.code, message: `예약된 레코드 키: ${bad.key}` };
    }
    const v = convertForType(value, variable.dataType);
    const p = prepareCell(cell, variable.dataType);
    return { kind: "value", value: judge(variable, cell, v, p, opts) };
  } catch (e) {
    if (e instanceof EvalexError) return { kind: "error", code: e.code, message: e.message };
    if (e instanceof FallbackSignal) return { kind: "fallback", reason: e.reason };
    return { kind: "error", code: "EVALUATION_ERROR", message: String(e) };
  }
}

