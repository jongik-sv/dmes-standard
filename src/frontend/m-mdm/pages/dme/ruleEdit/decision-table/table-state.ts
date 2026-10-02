/**
 * 의사결정표 편집 상태(TSK-08-02 design §6.7.4) — 순수 reducer. 카드는 이 상태만 그리고, 편집은 action 으로만 한다.
 * 편집 불가(서버 판정 `editable` 거짓)면 어떤 편집도 받지 않는다. 즉시 검사는 `tableAnalysis` 가 상태마다 다시 돈다(I13).
 */
import type { HitPolicy } from "@/evalex";
import { sameVer } from "@/shell/version-format";

import type { TableSaveRow } from "../api";
import type { HitPolicyCode, ResolvedVar, RuleEditView, StoredRow } from "../types";
import { runAnalysis, type AnalysisResult } from "./analysis";
import {
  applyCellEdit,
  copyNormalRow,
  gridRowsFromStored,
  newDefaultRow,
  newNormalRow,
  resequence,
  storedRowsFromGrid,
  type CellKey,
  type GridRow,
} from "./grid-model";

export interface TableState {
  ruleId: string;
  ruleKind: "DECISION" | "DERIVE";
  editable: boolean;
  vars: ResolvedVar[];
  loadedRows: GridRow[];
  loadedHit: HitPolicyCode | null;
  rows: GridRow[];
  hitPolicy: HitPolicyCode | null;
  /** 마지막으로 쓴 임시 ID(0 이면 아직 없음). 새 행은 이것보다 1 작은 값 — 지운 번호를 다시 쓰지 않는다. */
  lastTempId: number;
  selectedRowId: number | null;
}

export type TableAction =
  | { type: "load"; view: RuleEditView }
  | { type: "addRow" }
  | { type: "addDefaultRow" }
  | { type: "copyRow"; rowId: number }
  | { type: "editCell"; rowId: number; varId: number; key: CellKey; value: string | boolean }
  | { type: "editNote"; rowId: number; value: string }
  | { type: "deleteRow"; rowId: number }
  | { type: "reorder"; keys: (string | number)[] }
  | { type: "setHitPolicy"; value: HitPolicyCode }
  | { type: "revert" }
  | { type: "selectRow"; rowId: number | null };

export function initTableState(view: RuleEditView): TableState {
  const selected = view.versions.find((v) => sameVer(v.ver, view.selectedVer));
  const rows = gridRowsFromStored(view.vars, view.rows);
  const hit = (selected?.hitPolicy ?? null) as HitPolicyCode | null;
  const minId = rows.reduce((m, r) => Math.min(m, r.rowId), 0);
  return {
    ruleId: view.rule.maruRuleId,
    ruleKind: view.rule.ruleKind,
    // 산출(DERIVE) 룰 편집은 열 설정(08-03) 몫이라 이 표는 읽기 전용이다.
    editable: view.editable && view.rule.ruleKind === "DECISION",
    vars: view.vars,
    loadedRows: rows,
    loadedHit: hit,
    rows,
    hitPolicy: hit,
    lastTempId: minId,
    selectedRowId: null,
  };
}

function nextTemp(state: TableState): number {
  return Math.min(state.lastTempId, 0) - 1;
}

export function tableReducer(state: TableState, action: TableAction): TableState {
  if (action.type === "load") return initTableState(action.view);
  if (action.type === "selectRow") return state.selectedRowId === action.rowId ? state : { ...state, selectedRowId: action.rowId };
  if (!state.editable) return state;
  switch (action.type) {
    case "addRow": {
      if (state.ruleKind !== "DECISION") return state;
      const id = nextTemp(state);
      return { ...state, rows: resequence([...state.rows, newNormalRow(state.vars, id)]), lastTempId: id };
    }
    case "addDefaultRow": {
      if (state.ruleKind !== "DECISION" || state.rows.some((r) => r.rowKind === "DEFAULT")) return state;
      const id = nextTemp(state);
      return { ...state, rows: resequence([...state.rows, newDefaultRow(id)]), lastTempId: id };
    }
    case "editCell": {
      const v = state.vars.find((x) => x.varId === action.varId);
      if (!v) return state;
      let touched = false;
      const rows = state.rows.map((r) => {
        if (r.rowId !== action.rowId) return r;
        if (r.rowKind === "DEFAULT" && v.varKind === "COND") return r;
        const next = applyCellEdit(v, r.cells[action.varId], action.key, action.value);
        if (next === r.cells[action.varId]) return r;
        touched = true;
        const cells = { ...r.cells };
        if (next === undefined) delete cells[action.varId];
        else cells[action.varId] = next;
        return { ...r, cells };
      });
      return touched ? { ...state, rows } : state;
    }
    case "editNote":
      return { ...state, rows: state.rows.map((r) => (r.rowId === action.rowId ? { ...r, note: action.value } : r)) };
    case "copyRow": {
      // 원본 바로 아래에 넣고 새 행을 고른다. 기본 행은 하나뿐이라 복사하지 않는다(I21).
      if (state.ruleKind !== "DECISION") return state;
      const at = state.rows.findIndex((r) => r.rowId === action.rowId);
      if (at < 0 || state.rows[at].rowKind !== "NORMAL") return state;
      const id = nextTemp(state);
      const rows = [...state.rows.slice(0, at + 1), copyNormalRow(state.rows[at], id), ...state.rows.slice(at + 1)];
      return { ...state, rows: resequence(rows), lastTempId: id, selectedRowId: id };
    }
    case "deleteRow":
      return {
        ...state,
        rows: resequence(state.rows.filter((r) => r.rowId !== action.rowId)),
        selectedRowId: state.selectedRowId === action.rowId ? null : state.selectedRowId,
      };
    case "reorder": {
      const byKey = new Map(state.rows.map((r) => [String(r.rowId), r]));
      const ordered = action.keys.map((k) => byKey.get(String(k))).filter((r): r is GridRow => !!r);
      // 키 집합은 한 번만 만든다(행마다 키 목록을 다시 만들면 2,600행 표에서 O(n²)).
      const keySet = new Set(action.keys.map(String));
      const rest = state.rows.filter((r) => !keySet.has(String(r.rowId)));
      return { ...state, rows: resequence([...ordered, ...rest]) };
    }
    case "setHitPolicy":
      // 적중 정책은 판정 룰(DECISION)에만 있다 — 표와 함께 [표 저장] 한 번으로 저장한다(D-133).
      if (state.ruleKind !== "DECISION" || state.hitPolicy === action.value) return state;
      return { ...state, hitPolicy: action.value };
    case "revert":
      // 적중 정책도 되돌린다(D-133) — 표 편집과 한 묶음이다.
      return { ...state, rows: state.loadedRows, hitPolicy: state.loadedHit, selectedRowId: null };
  }
  return state;
}

/** 드래그 대상 — NORMAL 행만(I21). */
export function isRowDraggable(row: Pick<GridRow, "rowKind">): boolean {
  return row.rowKind === "NORMAL";
}

export function tableStoredRows(state: Pick<TableState, "vars" | "rows">): StoredRow[] {
  return storedRowsFromGrid(state.vars, state.rows);
}

/** 불러온 표의 직렬화 — 편집마다 다시 만들지 않게 카드가 불러올 때 한 번만 만들어 `isDirty` 에 넘긴다(2,600행 표). */
export function loadedRowsJson(state: Pick<TableState, "vars" | "loadedRows">): string {
  return JSON.stringify(storedRowsFromGrid(state.vars, state.loadedRows));
}

/** 저장 행 두 벌이 같은가 — 행마다 칸(rowId·seq·rowKind·cells·note)을 견준다. 두 벌을 통째로 `JSON.stringify` 해 견준 것과 같은 판정이다. */
export function sameStoredRows(a: readonly StoredRow[], b: readonly StoredRow[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x.rowId !== y.rowId || x.seq !== y.seq || x.rowKind !== y.rowKind || x.cells !== y.cells || x.note !== y.note) return false;
  }
  return true;
}

/**
 * `pre` — 이미 만든 편집본 행(`stored`)·불러온 표 저장 행(`loaded`)이 있으면 다시 만들지 않는다. `loaded` 가 있으면 행마다 견주어
 * 표 전체를 직렬화하지 않는다(바뀌지 않은 행은 같은 저장 행 객체라 참조 비교로 끝난다). `loadedJson` 은 옛 호출 모양이다.
 */
export function isDirty(
  state: Pick<TableState, "vars" | "rows" | "loadedRows" | "hitPolicy" | "loadedHit">,
  pre: { stored?: readonly StoredRow[]; loaded?: readonly StoredRow[]; loadedJson?: string } = {},
): boolean {
  // 적중 정책을 바꿨으면 행과 상관없이 저장 안 한 변경이다(D-133).
  if (state.hitPolicy !== state.loadedHit) return true;
  // 불러온 뒤 편집이 없으면 같은 배열이다 — 직렬화 비교를 건너뛴다.
  if (state.rows === state.loadedRows) return false;
  const stored = pre.stored ?? tableStoredRows(state);
  if (pre.loaded || pre.loadedJson === undefined) {
    return !sameStoredRows(stored, pre.loaded ?? storedRowsFromGrid(state.vars, state.loadedRows));
  }
  return JSON.stringify(stored) !== pre.loadedJson;
}

/** 즉시 검사 — `ruleDefFromStored(storedRowsFromGrid(…))` → evalex `analyzeRule`(I13). */
export function tableAnalysis(state: Pick<TableState, "ruleId" | "ruleKind" | "hitPolicy" | "vars" | "rows">): AnalysisResult {
  return runAnalysis(state.ruleId, state.ruleKind, state.hitPolicy as HitPolicy | null, state.vars, tableStoredRows(state));
}

/** 표 저장 본문 행 — 보이는 순서, 새 행은 음수 임시 ID(seq 는 서버가 정한다, I10). */
export function saveRowsOf(state: TableState): TableSaveRow[] {
  return tableStoredRows(state).map((r) => ({ rowId: r.rowId, rowKind: r.rowKind, cells: r.cells, note: r.note ?? null }));
}
