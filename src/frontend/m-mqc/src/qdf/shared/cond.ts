/**
 * Maru 셀(qcdRule search 의 cells) → 조건 모양으로 풀고, 화면에서 값 하나를 조건에 대어 본다.
 * 판정의 정본은 서버(qcdRule judge)다. 여기 평가는 화면 표시용이다 — 매트릭스 칸 펼치기(생산가부), 조건별 ✓/✕ 와 미입력 집계(주문정합성).
 *
 * 셀 op: EQ·NE·GT·GE·LT·LE·IN·NOT_IN·IS_NULL·NOT_NULL·NA, 범위는 `<= 변수 <`·`<= 변수 <=`·`< 변수 <`·`< 변수 <=`(left·right).
 */
import type { RuleCell, RuleRow, RuleVar } from "@/common/rule";

export type CondOp =
  | "EQ"
  | "NE"
  | "GT"
  | "GE"
  | "LT"
  | "LE"
  | "IN"
  | "NOT_IN"
  | "IS_NULL"
  | "NOT_NULL"
  | "BETWEEN"
  | "NA"
  | "UNKNOWN";

export interface Cond {
  op: CondOp;
  /** EQ·NE·GT·GE·LT·LE 는 값 하나, IN·NOT_IN 은 목록. */
  values: string[];
  low?: string;
  high?: string;
  lowInclusive?: boolean;
  highInclusive?: boolean;
  /** 엔진 요약 원문(모르는 모양일 때 그대로 보인다). */
  summary: string;
}

const SIMPLE_OPS = new Set(["EQ", "NE", "GT", "GE", "LT", "LE"]);
const RANGE_OP = /^(<=?)\s*변수\s*(<=?)$/;

/** 셀 → 조건. 셀이 없거나 NA 면 op NA(보지 않는 조건). */
export function parseCell(cell: RuleCell | undefined): Cond {
  const summary = cell?.summary ?? "-";
  const op = (cell?.op ?? "NA").trim();
  if (!cell || op === "NA" || op === "")
    return { op: "NA", values: [], summary };
  if (SIMPLE_OPS.has(op))
    return { op: op as CondOp, values: [cell.left ?? ""], summary };
  if (op === "IN" || op === "NOT_IN")
    return { op, values: cell.list ?? [], summary };
  if (op === "IS_NULL" || op === "NOT_NULL") return { op, values: [], summary };
  const m = RANGE_OP.exec(op);
  if (m)
    return {
      op: "BETWEEN",
      values: [],
      low: cell.left ?? "",
      high: cell.right ?? "",
      lowInclusive: m[1] === "<=",
      highInclusive: m[2] === "<=",
      summary,
    };
  return { op: "UNKNOWN", values: [], summary };
}

/** 행의 조건 변수 이름 → 조건(NA 는 뺀다). 변수 순서는 vars 의 seq 순. */
export function rowConds(
  vars: readonly RuleVar[],
  row: RuleRow,
): { name: string; cond: Cond }[] {
  return vars
    .filter((v) => v.kind === "COND" && v.name)
    .sort((a, b) => a.seq - b.seq || a.varId - b.varId)
    .map((v) => ({
      name: v.name as string,
      cond: parseCell(row.cells[String(v.varId)]),
    }))
    .filter((c) => c.cond.op !== "NA");
}

/** 주문정합성 시제품과 같은 숫자 꼴 — 부호·소수만(지수·16진 없음). */
export const NUM_RE = /^-?(\d+(\.\d+)?|\.\d+)$/;

/** 빈 값(미입력) — null·undefined·공백만인 글. 0 은 빈 값이 아니다. */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/**
 * 조건 하나 평가 — P 충족 · F 불충족 · N 미입력이라 비교 못 함(IS_NULL·NOT_NULL 만 빈 값을 본다) ·
 * X 숫자 변수인데 숫자가 아님 · U 모르는 셀 모양.
 */
export type CondState = "P" | "F" | "N" | "X" | "U";

export function testCond(
  cond: Cond,
  raw: unknown,
  numeric: boolean,
): CondState {
  if (cond.op === "NA") return "P";
  if (cond.op === "UNKNOWN") return "U";
  const blank = isBlank(raw);
  if (cond.op === "IS_NULL") return blank ? "P" : "F";
  if (cond.op === "NOT_NULL") return blank ? "F" : "P";
  if (blank) return "N";
  const text = String(raw).trim();
  if (numeric) {
    if (!NUM_RE.test(text)) return "X";
    const x = Number(text);
    const n = (s: string | undefined) => Number(s ?? "");
    let pass: boolean;
    switch (cond.op) {
      case "EQ":
        pass = x === n(cond.values[0]);
        break;
      case "NE":
        pass = x !== n(cond.values[0]);
        break;
      case "GT":
        pass = x > n(cond.values[0]);
        break;
      case "GE":
        pass = x >= n(cond.values[0]);
        break;
      case "LT":
        pass = x < n(cond.values[0]);
        break;
      case "LE":
        pass = x <= n(cond.values[0]);
        break;
      case "IN":
        pass = cond.values.some((v) => n(v) === x);
        break;
      case "NOT_IN":
        pass = !cond.values.some((v) => n(v) === x);
        break;
      case "BETWEEN":
        pass =
          (cond.lowInclusive ? x >= n(cond.low) : x > n(cond.low)) &&
          (cond.highInclusive ? x <= n(cond.high) : x < n(cond.high));
        break;
      default:
        return "U";
    }
    return pass ? "P" : "F";
  }
  switch (cond.op) {
    case "EQ":
      return text === cond.values[0] ? "P" : "F";
    case "NE":
      return text !== cond.values[0] ? "P" : "F";
    case "IN":
      return cond.values.includes(text) ? "P" : "F";
    case "NOT_IN":
      return cond.values.includes(text) ? "F" : "P";
    default:
      // 글 변수에 순서 비교 — 사전식 비교는 하지 않는다.
      return "U";
  }
}
