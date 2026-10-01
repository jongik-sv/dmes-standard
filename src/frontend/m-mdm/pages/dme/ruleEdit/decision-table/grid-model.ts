/**
 * 의사결정표 그리드 모델(TSK-08-02 design §6.5·§6.7.4) — 순수 함수만 둔다.
 *
 * 행의 기준 값은 파싱한 셀 객체(`ast`·`list` 포함)이고 그리드 표시 칸은 여기서 만든다. 저장할 때는 셀 객체를 그대로
 * `JSON.stringify` 한다 — 06 키 순서(op,left,right,list,expr,ast,val)와 var_id 오름차순이라 손대지 않은 행은 바이트 단위로 같다.
 * `ruleDefFromStored` 는 서버 `RuleAnalysisInputMapper.toAnalysisRule` 과 같은 규칙으로 분석 입력을 만든다(코퍼스 동치, §3.3).
 */
import type { DispType, HitPolicy, RuleDef, RuleVarDef } from "@/evalex";

import type { ResolvedVar, StoredRow } from "../types";
import { isListOp, isNoValueOp, isRangeOp } from "./ops";

/** 셀 객체 — 06 「셀 JSON」 일곱 키. */
export interface CellObj {
  op?: string;
  left?: string;
  right?: string;
  list?: string[];
  expr?: string;
  ast?: unknown;
  val?: string;
}

/** 칸 이름 — 행 데이터 필드 `c{varId}_{k}`. */
export type CellKey = "op" | "left" | "right" | "na" | "expr" | "val";

export interface GridRow {
  rowId: number;
  seq: number;
  rowKind: "NORMAL" | "DEFAULT";
  note: string;
  cells: Record<number, CellObj>;
}

/** 분석 입력에 필요한 변수 칸(코퍼스 `vars` 모양 = `ResolvedVar` 의 부분 집합). */
export type StoredVar = Pick<ResolvedVar, "varId" | "varKind" | "dispType" | "seq" | "varName" | "exprVar" | "dataType"> &
  Partial<Pick<ResolvedVar, "scale" | "dateString" | "maruCodeId" | "label">>;

const CELL_KEYS = ["op", "left", "right", "list", "expr", "ast", "val"] as const;

/** 06 키 순서로 다시 세운다(없는 키는 넣지 않는다). */
function canonical(cell: CellObj): CellObj {
  const out: Record<string, unknown> = {};
  for (const k of CELL_KEYS) if (cell[k] !== undefined) out[k] = cell[k];
  return out as CellObj;
}

export function parseCells(json: string): Record<number, CellObj> {
  const raw = JSON.parse(json || "{}") as Record<string, CellObj>;
  const out: Record<number, CellObj> = {};
  for (const [k, v] of Object.entries(raw)) out[Number(k)] = v;
  return out;
}

export function writeCells(cells: Record<number, CellObj>): string {
  return JSON.stringify(cells);
}

function sortRows<T extends { rowKind: string; seq: number; rowId: number }>(rows: T[]): T[] {
  const normal = rows.filter((r) => r.rowKind !== "DEFAULT").sort((a, b) => a.seq - b.seq || a.rowId - b.rowId);
  return [...normal, ...rows.filter((r) => r.rowKind === "DEFAULT")];
}

/** 저장 형태 → 그리드 행. NORMAL 은 seq→rowId 순, 기본 행은 끝. */
export function gridRowsFromStored(_vars: readonly StoredVar[], rows: readonly StoredRow[]): GridRow[] {
  return sortRows(
    rows.map((r) => ({ rowId: r.rowId, seq: r.seq, rowKind: r.rowKind, note: r.note ?? "", cells: parseCells(r.cells) })),
  );
}

/**
 * 행별 직렬화 재사용(편집 1회에 표 전체를 다시 직렬화하지 않게). 그리드 행·셀 객체는 바꾸지 않고 새로 만든다(reducer)는 전제로
 * 셀 객체 → 셀 JSON, 그리드 행 → 저장 행을 기억한다. 저장 행은 seq·내용이 같을 때만 다시 쓴다(행 객체 참조가 같아도 seq 는 자리로 정해진다).
 */
const cellsJsonOf = new WeakMap<object, string>();
const storedOf = new WeakMap<GridRow, StoredRow>();

function cellsJson(cells: Record<number, CellObj>): string {
  let s = cellsJsonOf.get(cells);
  if (s === undefined) {
    s = writeCells(cells);
    cellsJsonOf.set(cells, s);
  }
  return s;
}

/** 그리드 행 → 저장 형태. seq 는 배열 순서대로 NORMAL 1..n, 기본 행 0(서버도 같게 정한다, I10). 바뀌지 않은 행은 앞서 만든 저장 행 객체를 그대로 돌려준다. */
export function storedRowsFromGrid(_vars: readonly StoredVar[], rows: readonly GridRow[]): StoredRow[] {
  let n = 0;
  return rows.map((r) => {
    const seq = r.rowKind === "DEFAULT" ? 0 : ++n;
    const cells = cellsJson(r.cells);
    const note = r.note === "" ? null : r.note;
    const prev = storedOf.get(r);
    if (prev && prev.seq === seq && prev.rowId === r.rowId && prev.rowKind === r.rowKind && prev.cells === cells && prev.note === note) return prev;
    const out: StoredRow = { rowId: r.rowId, seq, rowKind: r.rowKind, cells, note };
    storedOf.set(r, out);
    return out;
  });
}

const DISP: Record<string, DispType> = { Equal: "EQUAL", "1": "ONE", "2": "TWO", Expression: "EXPRESSION", Value: "VALUE" };

/** 저장 형태 → evalex `RuleDef`. 06 표기 DISP_TYPE → 분석기 표기, 식 변수·Expression 조건 열은 이름 없음(서버와 같다). */
export function ruleDefFromStored(
  ruleId: string,
  ruleKind: "DECISION" | "DERIVE",
  hitPolicy: HitPolicy | null,
  vars: readonly StoredVar[],
  rows: readonly StoredRow[],
): RuleDef {
  const defs: RuleVarDef[] = vars.map((v) => {
    const dispType: DispType = v.dispType == null ? (v.varKind === "COND" ? "ONE" : "VALUE") : DISP[v.dispType];
    if (!dispType) throw new Error(`모르는 DISP_TYPE: ${v.dispType}`);
    const nameless = v.exprVar || (v.varKind === "COND" && dispType === "EXPRESSION");
    return {
      varId: v.varId,
      varKind: v.varKind,
      dispType,
      seq: v.seq,
      varName: nameless ? null : v.varName,
      label: v.label ?? null,
      dataType: v.dataType ?? "STRING",
      scale: v.scale ?? null,
      dateString: !!v.dateString,
      maruCodeId: v.maruCodeId ?? null,
    };
  });
  return {
    ruleId,
    ruleKind,
    hitPolicy,
    vars: defs,
    rows: rows.map((r) => ({ rowId: r.rowId, seq: r.seq, rowKind: r.rowKind, cells: parseCells(r.cells) as RuleDef["rows"][number]["cells"] })),
  };
}

function isExpressionCell(v: StoredVar): boolean {
  return v.dispType === "Expression";
}

/**
 * 셀 편집 규칙(§6.7.4 표, I19). 바꾸지 않는 편집(잠긴 칸, 같은 값)은 받은 셀을 그대로 돌려준다.
 * @param value `na` 는 boolean, 나머지는 문자열
 */
export function applyCellEdit(v: StoredVar, cell: CellObj | undefined, key: CellKey, value: string | boolean): CellObj | undefined {
  if (isExpressionCell(v)) {
    if (key === "expr") return applyExprEdit(v, cell, typeof value === "string" ? value : "");
    // 조건 식의 무관 켬 = 식을 버리고 `{op:"NA"}`. 끔은 채울 식이 없어 바꾸지 않는다(식을 적으면 풀린다).
    if (key === "na" && v.varKind === "COND" && value === true) return cell?.op === "NA" ? cell : { op: "NA" };
    return cell;
  }
  const text = typeof value === "string" ? value : "";

  if (v.varKind === "RESULT") {
    return key === "val" ? { val: text.trim() } : cell;
  }

  if (v.dispType === "Equal") {
    if (key === "na") return value === true ? { op: "NA" } : { op: "EQ", left: "" };
    if (key === "left") return { op: "EQ", left: text.trim() };
    return cell;
  }

  if (key === "op") return changeOp(cell, text);
  if (!cell || isNoValueOp(cell.op)) return cell;
  if (key === "left") {
    if (isListOp(cell.op)) {
      const list = text
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s !== "");
      return canonical({ op: cell.op, list });
    }
    return canonical({ ...cell, left: text.trim() });
  }
  if (key === "right") {
    return isRangeOp(cell.op) ? canonical({ ...cell, right: text.trim() }) : cell;
  }
  return cell;
}

/**
 * 식 칸 편집(D7 번복, 2026-09-28). 글자를 넣으면 `{expr}` 만 남긴다 — `ast` 는 표 저장 때 서버가 파싱해 채운다(화면 파서 없음, 불변 9).
 * 비우면 조건 식은 무관 `{op:"NA"}`, 결과 식은 칸을 없앤다(`{expr:""}` 는 서버가 파싱하지 못한다). 같은 식이면 받은 셀(과 그 `ast`)을 그대로 둔다.
 */
function applyExprEdit(v: StoredVar, cell: CellObj | undefined, raw: string): CellObj | undefined {
  const text = raw.trim();
  if (text === "") {
    if (v.varKind === "RESULT") return undefined;
    return cell?.op === "NA" && cell.expr === undefined ? cell : { op: "NA" };
  }
  const same = cell?.expr === text && cell.op === undefined && cell.val === undefined;
  return same ? cell : { expr: text };
}

/** op 바꾸기 — 값을 되도록 옮긴다(§6.7.4). */
function changeOp(cell: CellObj | undefined, op: string): CellObj {
  const from = cell?.op;
  const left = cell?.left ?? (cell?.list && cell.list.length > 0 ? cell.list[0] : undefined);
  if (isNoValueOp(op)) return { op };
  if (op === "CODE_IN") return { op, left: "" };
  if (isListOp(op)) {
    if (isListOp(from)) return { op, list: [...(cell?.list ?? [])] };
    return { op, list: cell?.left ? [cell.left] : [] };
  }
  if (isRangeOp(op)) {
    if (isRangeOp(from)) return { op, left: cell?.left ?? "", right: cell?.right ?? "" };
    return { op, left: left ?? "", right: "" };
  }
  // 단일 값 op(EQ·NE·LT·LE·GT·GE·CONTAINS·INSTR)
  if (isRangeOp(from)) return { op, left: cell?.left || cell?.right || "" };
  return { op, left: left ?? "" };
}

/** 새 행 — 조건 셀 모두 `{op:"NA"}`(Expression 조건 열 포함), 결과 셀 없음(I21). */
export function newNormalRow(vars: readonly StoredVar[], tempId: number): GridRow {
  const cells: Record<number, CellObj> = {};
  for (const v of [...vars].filter((x) => x.varKind === "COND").sort((a, b) => a.varId - b.varId)) cells[v.varId] = { op: "NA" };
  return { rowId: tempId, seq: 0, rowKind: "NORMAL", note: "", cells };
}

/** 행 복사 — 셀·행 설명을 그대로 옮긴 새 NORMAL 행(셀은 깊은 복사라 원본과 따로 편집된다). */
export function copyNormalRow(src: GridRow, tempId: number): GridRow {
  return { rowId: tempId, seq: 0, rowKind: "NORMAL", note: src.note, cells: JSON.parse(JSON.stringify(src.cells)) as Record<number, CellObj> };
}

/** 기본 행 — 조건 셀 없음, seq 0. */
export function newDefaultRow(tempId: number): GridRow {
  return { rowId: tempId, seq: 0, rowKind: "DEFAULT", note: "", cells: {} };
}

/** NORMAL 은 지금 순서대로 1..n, 기본 행은 늘 마지막(seq 0). */
export function resequence(rows: readonly GridRow[]): GridRow[] {
  let n = 0;
  // seq 가 이미 맞는 행은 그 객체를 그대로 둔다(구조적 공유) — 행 추가·삭제·순서 바꾸기 때 모든 행이 새 객체가 되면
  // 뒤따르는 직렬화·base 비교·표시 행 캐시가 모두 빗나간다.
  const at = (r: GridRow, seq: number): GridRow => (r.seq === seq ? r : { ...r, seq });
  const normal = rows.filter((r) => r.rowKind !== "DEFAULT").map((r) => at(r, ++n));
  return [...normal, ...rows.filter((r) => r.rowKind === "DEFAULT").map((r) => at(r, 0))];
}
