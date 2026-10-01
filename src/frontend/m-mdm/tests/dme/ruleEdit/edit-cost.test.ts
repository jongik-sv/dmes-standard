// 룰 편집 화면 편집 1회의 계산 비용(속도·부하 낭비 개선) — 시간(ms)이 아니라 결정적인 수치(JSON 파싱·직렬화 글자 수·호출 수,
// 새로 만든 행 객체 수)를 센다. 같은 PC 에서도 시간 측정은 2배씩 흔들리므로 쓰지 않는다.
//
// 캐시는 행 객체 참조를 열쇠로 쓰므로 테스트마다 행 객체를 새로 만든다(공용 상수 SAMPLE_ROWS 를 쓰면 앞 테스트의 캐시가 섞인다).
import { afterEach, describe, expect, it } from "vitest";

import { splitIssues } from "../../../pages/dme/ruleEdit/decision-table/analysis";
import { createDisplayRowCache, displayRows, forgetDisplayRow, markTokenOf } from "../../../pages/dme/ruleEdit/decision-table/columns";
import { diffTable } from "../../../pages/dme/ruleEdit/decision-table/diff";
import { gridRowsFromStored, resequence, type GridRow } from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import {
  initTableState,
  isDirty,
  loadedRowsJson,
  tableReducer,
  tableStoredRows,
  type TableState,
} from "../../../pages/dme/ruleEdit/decision-table/table-state";
import { computeContract, contractSourceOfView, exprSlotsOf, type AstByText } from "../../../pages/dme/ruleEdit/sections/contract/contract-view";
import { INITIAL_WORKBENCH, workbenchReducer } from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { ResolvedVar, RuleEditView, StoredRow } from "../../../pages/dme/ruleEdit/types";
import { ast } from "../../helpers/parse-expr";
import { draftView } from "./fixtures";

const N = 200;
const EXPR = "X > 1";

const VARS: ResolvedVar[] = [
  { varId: 1, varKind: "COND", dispType: "1", seq: 1, varName: "A", exprVar: false, label: "에이", dataType: "NUMBER", scale: null, dateString: false, typeSource: "COLUMN" },
  { varId: 2, varKind: "COND", dispType: "Expression", seq: 2, varName: null, exprVar: false, label: "식", dataType: "STRING", scale: null, dateString: false, typeSource: "EXPRESSION_COLUMN" },
  { varId: 3, varKind: "RESULT", dispType: "Value", seq: 1, varName: "OUT", exprVar: false, label: "결과", dataType: "STRING", scale: null, dateString: false, typeSource: "DECLARED" },
];

/** 행 n 개(NORMAL n-1 + 기본 행). 부를 때마다 새 객체다. */
function makeRows(n: number): StoredRow[] {
  const out: StoredRow[] = [];
  for (let i = 1; i < n; i++) {
    const cells = { 1: { op: "EQ", left: String(i) }, 2: { expr: EXPR, ast: ast(EXPR) }, 3: { val: `R${i}` } };
    out.push({ rowId: i, seq: i, rowKind: "NORMAL", cells: JSON.stringify(cells), note: i % 3 === 0 ? `설명 ${i}` : null });
  }
  out.push({ rowId: n, seq: 0, rowKind: "DEFAULT", cells: JSON.stringify({ 3: { val: "D" } }), note: null });
  return out;
}

function bigView(n = N): RuleEditView {
  const rows = makeRows(n);
  return draftView("e2e_mdm_steward", "e2e_mdm_steward", { vars: VARS, rows, baseRows: makeRows(n) });
}

interface Cost {
  parseCalls: number;
  parseChars: number;
  stringifyCalls: number;
  stringifyChars: number;
}

/** fn 동안 JSON.parse·JSON.stringify 호출 수와 글자 수를 센다. */
function costOf<T>(fn: () => T): Cost & { value: T } {
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const c: Cost = { parseCalls: 0, parseChars: 0, stringifyCalls: 0, stringifyChars: 0 };
  JSON.parse = ((text: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    c.parseCalls++;
    c.parseChars += String(text).length;
    return parse(text, reviver);
  }) as typeof JSON.parse;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    const s = stringify(...args);
    c.stringifyCalls++;
    c.stringifyChars += s?.length ?? 0;
    return s;
  }) as typeof JSON.stringify;
  let value: T;
  try {
    value = fn();
  } finally {
    JSON.parse = parse;
    JSON.stringify = stringify;
  }
  return { ...c, value };
}

const report: string[] = [];
afterEach(() => {
  if (report.length > 0) console.log(report.splice(0).join("\n"));
});

function editCell(s: TableState, rowId: number, value: string): TableState {
  return tableReducer(s, { type: "editCell", rowId, varId: 1, key: "left", value });
}

/** 표 한 벌의 셀 JSON 글자 수(비교 기준). */
function tableChars(rows: readonly StoredRow[]): number {
  return rows.reduce((n, r) => n + r.cells.length, 0);
}

describe("룰 편집 1회 비용(결정적 수치)", () => {
  it("① 편집본 계약 — 칸 하나를 고치면 바뀐 행만 다시 파싱한다(식 슬롯·계약 계산 모두)", () => {
    const view = bigView();
    const asts: AstByText = { [EXPR]: ast(EXPR) };
    const srcOf = (rows: StoredRow[]) => ({ ...contractSourceOfView(view, "current")!, rows });
    let s = initTableState(view);
    const r0 = tableStoredRows(s);
    exprSlotsOf(srcOf(r0));
    computeContract(srcOf(r0), asts);

    s = editCell(s, 5, "77");
    const m = costOf(() => {
      const src = srcOf(tableStoredRows(s));
      return { slots: exprSlotsOf(src), contract: computeContract(src, asts) };
    });
    // 결과는 캐시 없이(새 행 객체) 계산한 것과 같다.
    const fresh = srcOf(tableStoredRows(s).map((r) => ({ ...r, cells: `${r.cells}` })));
    expect(m.value.slots).toEqual(exprSlotsOf(fresh));
    expect(m.value.contract).toEqual(computeContract(fresh, asts));
    report.push(`① 계약(편집본) 편집 1회: JSON.parse ${m.parseCalls}회 ${m.parseChars}자, stringify ${m.stringifyCalls}회 ${m.stringifyChars}자 (표 셀 ${tableChars(r0)}자, ${N}행)`);
    expect(m.parseCalls).toBeLessThanOrEqual(1);
  });

  it("② 표 직렬화 — 편집 1회에 바뀐 행만 직렬화하고, dirty·카드 공유 상태 비교는 직렬화 없이 한다", () => {
    const view = bigView();
    let s = initTableState(view);
    const loaded = tableStoredRows({ vars: s.vars, rows: s.loadedRows });
    const loadedJson = loadedRowsJson(s);
    let wb = workbenchReducer(INITIAL_WORKBENCH, { type: "publishTable", draft: { ruleId: s.ruleId, ver: 2, hitPolicy: s.hitPolicy, rows: loaded, dirty: false } });

    s = editCell(s, 5, "77");
    const m = costOf(() => {
      const stored = tableStoredRows(s);
      const dirty = isDirty(s, { stored, loaded, loadedJson });
      wb = workbenchReducer(wb, { type: "publishTable", draft: { ruleId: s.ruleId, ver: 2, hitPolicy: s.hitPolicy, rows: stored, dirty } });
      return { stored, dirty };
    });
    expect(m.value.dirty).toBe(true);
    expect(wb.tableDraft?.rev).toBe(2);
    expect(JSON.stringify(m.value.stored)).toBe(JSON.stringify(tableStoredRows({ vars: s.vars, rows: s.rows.map((r) => ({ ...r })) })));
    // 바뀌지 않은 행은 앞 직렬화 객체를 그대로 쓴다.
    const reused = m.value.stored.filter((r, i) => r === loaded[i]).length;
    report.push(
      `② 표 직렬화 편집 1회: stringify ${m.stringifyCalls}회 ${m.stringifyChars}자 (표 셀 ${tableChars(loaded)}자), 재사용 행 ${reused}/${loaded.length}`,
    );
    expect(m.stringifyCalls).toBeLessThanOrEqual(1);
    expect(reused).toBe(loaded.length - 1);

    // 되돌리면 dirty 가 꺼지고, 같은 내용을 다시 올리면 rev 가 오르지 않는다.
    const back = editCell(s, 5, "5");
    const stored = tableStoredRows(back);
    expect(isDirty(back, { stored, loaded, loadedJson })).toBe(false);
    expect(isDirty(back)).toBe(false);
    const same = workbenchReducer(wb, { type: "publishTable", draft: { ...wb.tableDraft!, rows: [...m.value.stored] } });
    expect(same).toBe(wb);
  });

  it("③ base 대비 강조 — 편집마다 base 행을 다시 파싱하지 않고 바뀐 행만 견준다", () => {
    const view = bigView();
    let s = initTableState(view);
    const d0 = diffTable(view.baseRows, s.rows);
    s = editCell(s, 5, "77");
    const m = costOf(() => diffTable(view.baseRows, s.rows));
    expect(m.value.rows.get(5)?.status).toBe("CHANGED");
    expect([...m.value.rows.get(5)!.changedVarIds]).toEqual([1]);
    expect(m.value.rows.get(6)?.status).toBe("SAME");
    // 결과는 캐시 없는 계산과 같다.
    const fresh = diffTable(
      view.baseRows.map((r) => ({ ...r, cells: `${r.cells}` })),
      s.rows.map((r) => ({ ...r, cells: JSON.parse(JSON.stringify(r.cells)) as GridRow["cells"] })),
    );
    expect([...m.value.rows.entries()].map(([k, v]) => [k, v.status, [...v.changedVarIds], v.noteChanged])).toEqual(
      [...fresh.rows.entries()].map(([k, v]) => [k, v.status, [...v.changedVarIds], v.noteChanged]),
    );
    const reused = [...m.value.rows.entries()].filter(([k, v]) => d0.rows.get(k) === v).length;
    report.push(
      `③ diff 편집 1회: JSON.parse ${m.parseCalls}회 ${m.parseChars}자, stringify ${m.stringifyCalls}회 ${m.stringifyChars}자, 재사용 행 결과 ${reused}/${s.rows.length}`,
    );
    expect(m.parseCalls).toBe(0);
    expect(m.stringifyCalls).toBeLessThanOrEqual(3 * 2);
  });

  it("④ 행 순서 바꾸기 — 키 목록을 행마다 다시 만들지 않는다", () => {
    const view = bigView();
    const s = initTableState(view);
    const keys = [...s.rows].reverse().filter((r) => r.rowKind === "NORMAL").map((r) => String(r.rowId));
    const includes = Array.prototype.includes;
    const map = Array.prototype.map;
    let includesCalls = 0;
    let mapCalls = 0;
    Array.prototype.includes = function (this: unknown[], ...a: [unknown, number?]) {
      includesCalls++;
      return includes.apply(this, a);
    };
    Array.prototype.map = function (this: unknown[], ...a: Parameters<typeof map>) {
      mapCalls++;
      return map.apply(this, a);
    } as typeof map;
    let next: TableState;
    try {
      next = tableReducer(s, { type: "reorder", keys });
    } finally {
      Array.prototype.includes = includes;
      Array.prototype.map = map;
    }
    expect(next.rows.map((r) => r.rowId)).toEqual([...keys.map(Number), N]);
    expect(next.rows.map((r) => r.seq)).toEqual([...keys.map((_, i) => i + 1), 0]);
    report.push(`④ reorder ${N}행: Array.includes ${includesCalls}회, Array.map ${mapCalls}회`);
    expect(includesCalls).toBe(0);
    expect(mapCalls).toBeLessThanOrEqual(5);
  });

  it("⑤ 행 추가·삭제 — seq 가 같은 행은 이전 객체를 그대로 쓴다", () => {
    const view = bigView();
    let s = initTableState(view);
    s = editCell(s, 5, "77"); // 불러온 seq 를 1..n 으로 맞춘다
    const prev = s.rows;
    const added = tableReducer(s, { type: "addRow" });
    const delLast = tableReducer(s, { type: "deleteRow", rowId: N - 1 });
    const delFirst = tableReducer(s, { type: "deleteRow", rowId: 1 });
    const fresh = (rows: GridRow[]) => rows.filter((r) => !prev.includes(r)).length;
    report.push(`⑤ resequence 새 행 객체: 행 추가 ${fresh(added.rows)}/${added.rows.length}, 마지막 행 삭제 ${fresh(delLast.rows)}/${delLast.rows.length}, 첫 행 삭제 ${fresh(delFirst.rows)}/${delFirst.rows.length}`);
    expect(fresh(added.rows)).toBe(1);
    expect(fresh(delLast.rows)).toBe(0);
    expect(fresh(delFirst.rows)).toBe(N - 2);
    // 값은 전과 같다 — NORMAL 1..n, 기본 행 0.
    expect(added.rows.map((r) => r.seq)).toEqual([...Array.from({ length: N }, (_, i) => i + 1), 0]);
    const moved = resequence([prev[3], prev[2], prev[0], prev[1]]);
    expect(moved.map((r) => [r.rowId, r.seq])).toEqual([
      [4, 1],
      [3, 2],
      [1, 3],
      [2, 4],
    ]);
  });

  it("⑤ 표시 행 — 칸 하나를 고치면 그 행 표시 객체만 새로 만들고 markToken 은 바뀐 행만 직렬화한다", () => {
    const view = bigView();
    let s = initTableState(view);
    const cache = createDisplayRowCache();
    const marks = (rows: GridRow[]) => ({ diff: diffTable(view.baseRows, rows), split: splitIssues([]), serverShown: false });
    const d0 = displayRows(s.rows, s.vars, marks(s.rows), cache);
    const t0 = markTokenOf(d0);
    expect(t0).toBe(JSON.stringify(d0.map((r) => [r.rowKey, r.__mk, r.__added, r.__hit])));

    s = editCell(s, 5, "77");
    const mk = marks(s.rows);
    const before = costOf(() => displayRows(s.rows, s.vars, mk));
    const m = costOf(() => displayRows(s.rows, s.vars, mk, cache));
    expect(m.value).toEqual(before.value);
    const newObjs = m.value.filter((r, i) => r !== d0[i]).length;
    const oldTok = costOf(() => JSON.stringify(m.value.map((r) => [r.rowKey, r.__mk, r.__added, r.__hit])));
    const tok = costOf(() => markTokenOf(m.value));
    expect(tok.value).toBe(oldTok.value);
    expect(tok.value).not.toBe(t0); // 바뀐 칸 강조(c)가 켜졌다
    report.push(
      `⑤ 표시 행 편집 1회: 새 객체 ${newObjs}/${m.value.length} (캐시 없으면 ${before.value.filter((r, i) => r !== d0[i]).length}), markToken 직렬화 ${tok.stringifyChars}자 (전체 ${oldTok.stringifyChars}자)`,
    );
    expect(newObjs).toBe(1);
    expect(tok.stringifyCalls).toBe(1);

    // 그리드가 표시 객체를 직접 고친 행(onCellValueChanged)은 잊으면 다시 만든다.
    const edited = m.value[0];
    edited.c1_left = "그리드가 고친 값";
    forgetDisplayRow(cache, 1);
    const again = displayRows(s.rows, s.vars, mk, cache);
    expect(again[0]).not.toBe(edited);
    expect(again[0].c1_left).toBe("1");
    expect(again.filter((r, i) => r !== m.value[i]).length).toBe(1);

    // 검사 표시가 바뀐 행만 새로 만든다.
    const split = splitIssues([{ code: "OVERLAP", severity: "WARNING", message: "겹침", rowIds: [7], varId: 1 } as never]);
    const withIssue = displayRows(s.rows, s.vars, { ...mk, split }, cache);
    expect(withIssue.filter((r, i) => r !== again[i]).map((r) => r.rowId)).toEqual([7]);
    expect(withIssue).toEqual(displayRows(s.rows, s.vars, { ...mk, split }));
  });
});

// gridRowsFromStored 는 위 테스트가 쓰지 않지만, 캐시 열쇠가 행 객체라는 전제를 확인한다 — 같은 저장 행을 다시 읽으면 새 객체다.
it("저장 행을 다시 읽으면 새 그리드 행 객체다(캐시가 섞이지 않는다)", () => {
  const rows = makeRows(3);
  const a = gridRowsFromStored(VARS, rows);
  const b = gridRowsFromStored(VARS, rows);
  expect(a[0]).not.toBe(b[0]);
  expect(a).toEqual(b);
});
