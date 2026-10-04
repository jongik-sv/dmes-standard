/** @vitest-environment happy-dom */

// TSK-08-02 design §3.2 — 의사결정표 카드 ③. 편집 상태는 순수 reducer(table-state)로 보고, 그리드 즉시 검사가 편집 한 번마다
// evalex `analyzeRule` 을 다시 부르는지(I13)는 그 함수를 감싼 spy 로 확인한다. 렌더 부분은 그리드 밖(버튼·검사 요약·요청 본문)만 본다.
import { StrictMode, createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { MdmMetaProvider, resetMdmMetaStore } from "@dk-oasis/shared/mdm-meta";

const analyzeSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/evalex", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../../src/evalex")>();
  return {
    ...orig,
    analyzeRule: (...args: Parameters<typeof orig.analyzeRule>) => {
      analyzeSpy.calls++;
      return orig.analyzeRule(...args);
    },
  };
});

import { DecisionTableCard } from "../../../pages/dme/ruleEdit/decision-table/DecisionTableCard";
import {
  initTableState,
  isDirty,
  isRowDraggable,
  saveRowsOf,
  tableAnalysis,
  tableReducer,
  tableStoredRows,
  type TableAction,
  type TableState,
} from "../../../pages/dme/ruleEdit/decision-table/table-state";
import { mapRowIds, runAnalysis, sameIssues, splitIssues } from "../../../pages/dme/ruleEdit/decision-table/analysis";
import { buildTableColumns, cellEditable } from "../../../pages/dme/ruleEdit/decision-table/columns";
import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import type { RuleEditView, RuleIssueView } from "../../../pages/dme/ruleEdit/types";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, selectValue, settleGrid, visibleText } from "../helpers/render";
import { SAMPLE_ROWS, SAMPLE_VARS, draftView } from "./fixtures";

function codes(state: TableState): string[] {
  return tableAnalysis(state).issues.map((i) => `${i.code}:${i.severity}:${i.rowIds.join("/")}`);
}

function run(state: TableState, ...actions: TableAction[]): TableState {
  return actions.reduce(tableReducer, state);
}

describe("표 상태 — 편집과 즉시 검사(I13·I19~I21)", () => {
  let s0: TableState;
  beforeEach(() => {
    s0 = initTableState(draftView("e2e_mdm_steward"));
    analyzeSpy.calls = 0;
  });

  it("처음 상태는 NORMAL 3행 + 기본 행이고 변경이 없다", () => {
    expect(s0.rows.map((r) => [r.rowId, r.seq, r.rowKind])).toEqual([
      [1, 1, "NORMAL"],
      [2, 2, "NORMAL"],
      [3, 3, "NORMAL"],
      [4, 0, "DEFAULT"],
    ]);
    expect(isDirty(s0)).toBe(false);
    expect(s0.hitPolicy).toBe("FIRST");
  });

  it("행 추가 → 조건 전부 - 인 새 행(임시 ID -1, 기본 행 앞)과 ALL_NA_ROW 오류", () => {
    const s = run(s0, { type: "addRow" });
    expect(s.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);
    expect(s.rows[3].cells).toEqual({ 1: { op: "NA" }, 2: { op: "NA" }, 3: { op: "NA" } });
    expect(s.rows[3].seq).toBe(4);
    expect(codes(s)).toContain("ALL_NA_ROW:ERROR:-1");
    expect(isDirty(s)).toBe(true);
    expect(analyzeSpy.calls).toBeGreaterThan(0);
  });

  it("임시 ID 는 지금까지 쓴 가장 작은 음수 - 1 이고 지운 번호를 다시 쓰지 않는다", () => {
    const s = run(s0, { type: "addRow" }, { type: "addRow" }, { type: "deleteRow", rowId: -2 }, { type: "addRow" });
    expect(s.rows.filter((r) => r.rowId < 0).map((r) => r.rowId)).toEqual([-1, -3]);
  });

  it("값을 고치면 검사가 다시 돌아 겹침(FIRST: 경고)과 도달 불가를 낸다", () => {
    const before = analyzeSpy.calls;
    tableAnalysis(s0);
    const s = run(s0, { type: "editCell", rowId: 2, varId: 3, key: "left", value: "A" });
    const afterCalls = analyzeSpy.calls;
    const c = codes(s);
    expect(analyzeSpy.calls).toBeGreaterThan(before);
    expect(afterCalls).toBeGreaterThan(before);
    expect(c).toContain("OVERLAP:WARNING:1/2");
    expect(c).toContain("UNREACHABLE:WARNING:2/1");
  });

  // D-133 — 적중 정책은 이 화면에서 고르고 표와 함께 저장한다(D-105 (4) 번복). 표 편집과 한 묶음이라 즉시 검사·dirty·되돌리기에 든다.
  it("적중 정책을 바꾸면 즉시 검사가 새 정책으로 돌고(UNIQUE 겹침 = 오류) dirty 가 된다", () => {
    const overlap = run(s0, { type: "editCell", rowId: 2, varId: 3, key: "left", value: "A" });
    expect(codes(overlap)).toContain("OVERLAP:WARNING:1/2");
    const unique = run(overlap, { type: "setHitPolicy", value: "UNIQUE" });
    expect(unique.hitPolicy).toBe("UNIQUE");
    expect(unique.loadedHit).toBe("FIRST");
    expect(codes(unique)).toContain("OVERLAP:ERROR:1/2");
    // 정책만 바꿔도(행 그대로) 저장 안 한 변경이다.
    const onlyHit = run(s0, { type: "setHitPolicy", value: "UNIQUE" });
    expect(onlyHit.rows).toBe(s0.rows);
    expect(isDirty(onlyHit)).toBe(true);
    expect(isDirty(run(onlyHit, { type: "setHitPolicy", value: "FIRST" }))).toBe(false);
  });

  it("되돌리기는 적중 정책도 불러온 값으로 되돌린다", () => {
    const s = run(s0, { type: "setHitPolicy", value: "COLLECT" }, { type: "addRow" });
    const back = run(s, { type: "revert" });
    expect(back.hitPolicy).toBe("FIRST");
    expect(back.rows).toBe(s0.loadedRows);
    expect(isDirty(back)).toBe(false);
  });

  it("산출 룰(DERIVE)에는 적중 정책을 두지 않는다 — setHitPolicy 를 받지 않는다", () => {
    const derive = draftView("e2e_mdm_steward");
    const s = initTableState({ ...derive, rule: { ...derive.rule, ruleKind: "DERIVE" }, versions: derive.versions.map((v) => ({ ...v, hitPolicy: null })) });
    expect(run(s, { type: "setHitPolicy", value: "FIRST" }).hitPolicy).toBeNull();
  });

  it("드래그로 순서를 바꾸면 seq 가 다시 매겨지고 검사도 새 순서로 돈다", () => {
    const s1 = run(s0, { type: "editCell", rowId: 2, varId: 3, key: "left", value: "A" });
    const s2 = run(s1, { type: "reorder", keys: ["2", "1", "3", "4"] });
    expect(s2.rows.map((r) => [r.rowId, r.seq])).toEqual([
      [2, 1],
      [1, 2],
      [3, 3],
      [4, 0],
    ]);
    expect(codes(s2)).toContain("UNREACHABLE:WARNING:1/2");
    expect(codes(s2)).not.toContain("UNREACHABLE:WARNING:2/1");
  });

  it("기본 행은 드래그 대상이 아니고, 가운데로 옮겨도 늘 마지막이다(I21)", () => {
    expect(isRowDraggable(s0.rows[3])).toBe(false);
    expect(isRowDraggable(s0.rows[0])).toBe(true);
    const s = run(s0, { type: "reorder", keys: ["1", "4", "2", "3"] });
    expect(s.rows.map((r) => r.rowId)).toEqual([1, 2, 3, 4]);
  });

  it("행 삭제·되돌리기", () => {
    const s = run(s0, { type: "deleteRow", rowId: 2 });
    expect(s.rows.map((r) => r.rowId)).toEqual([1, 3, 4]);
    expect(s.rows.map((r) => r.seq)).toEqual([1, 2, 0]);
    const back = run(s, { type: "revert" });
    expect(back.rows).toEqual(s0.rows);
    expect(isDirty(back)).toBe(false);
  });

  describe("Expression 칸 편집(D7 번복, 2026-09-28)", () => {
    // 조건 식 열(var 6, 이름 없음)과 결과 식 열(var 5). 저장된 식 칸에는 서버 AST 가 있다.
    const condExpr = { ...SAMPLE_VARS[0], varId: 6, dispType: "Expression" as const, seq: 4, varName: null, label: "두께 식", typeSource: "EXPRESSION_COLUMN" as const, dataType: "STRING" as const };
    const resultExpr = { ...SAMPLE_VARS[4], dispType: "Expression" as const };
    const exprView = () =>
      draftView("e2e_mdm_steward", "e2e_mdm_steward", {
        vars: [...SAMPLE_VARS.slice(0, 4), resultExpr, condExpr],
        rows: [
          { rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"op":"GE","left":"1.6"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"A"},"5":{"expr":"1.05","ast":{"type":"X"}},"6":{"expr":"COIL_THK > 1","ast":{"type":"X"}}}', note: null },
          { rowId: 2, seq: 2, rowKind: "NORMAL", cells: '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"B"},"6":{"op":"NA"}}', note: null },
          // 조건 식 열을 나중에 더해 셀이 없는 행
          { rowId: 3, seq: 3, rowKind: "NORMAL", cells: '{"1":{"op":"LT","left":"1.6"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"C"}}', note: null },
          { rowId: 4, seq: 0, rowKind: "DEFAULT", cells: '{"4":{"val":"C"},"5":{"expr":"0.90","ast":{"type":"X"}}}', note: null },
        ],
      });

    it("칸 잠금: 조건 식은 NORMAL 행의 식 칸과 무관 켜기, 결과 식은 기본 행에서도 식 칸을 편집한다", () => {
      const s = initTableState(exprView());
      const [r1, r2, r3, def] = s.rows;
      expect(cellEditable(condExpr, "expr", r1, true)).toBe(true);
      expect(cellEditable(condExpr, "expr", r2, true)).toBe(true); // 무관 {op:NA} 칸 — 식을 적으면 풀린다
      expect(cellEditable(condExpr, "expr", r3, true)).toBe(true); // 셀이 없는 칸 — 식을 넣으면 셀이 생긴다
      expect(cellEditable(condExpr, "na", r1, true)).toBe(true); // 식 칸 → 무관으로
      expect(cellEditable(condExpr, "na", r3, true)).toBe(true); // 셀 없음 → 무관으로
      expect(cellEditable(condExpr, "na", r2, true)).toBe(false); // 이미 무관 — 끌 때 채울 식이 없다
      for (const key of ["op", "left", "right", "val"] as const) expect(cellEditable(condExpr, key, r1, true), key).toBe(false);
      expect(cellEditable(condExpr, "expr", def, true)).toBe(false); // 기본 행의 조건 칸은 잠근다
      expect(cellEditable(condExpr, "na", def, true)).toBe(false);
      expect(cellEditable(condExpr, "expr", r1, false)).toBe(false);
      expect(cellEditable(resultExpr, "expr", r1, true)).toBe(true);
      expect(cellEditable(resultExpr, "expr", r2, true)).toBe(true); // 결과 칸이 없는 행에도 식을 넣는다
      expect(cellEditable(resultExpr, "expr", def, true)).toBe(true);
      expect(cellEditable(resultExpr, "val", def, true)).toBe(false);
      expect(cellEditable(resultExpr, "expr", r1, false)).toBe(false);
    });

    it("편집: 식을 넣으면 {expr}(trim), 조건 식을 비우면 무관, 결과 식을 비우면 칸이 없어지고 기본 행 조건은 바뀌지 않는다", () => {
      const s = initTableState(exprView());
      const s2 = run(
        s,
        { type: "editCell", rowId: 1, varId: 6, key: "expr", value: "  COIL_THK > 2 " },
        { type: "editCell", rowId: 2, varId: 6, key: "expr", value: "COIL_WID > 1000" },
        { type: "editCell", rowId: 1, varId: 5, key: "expr", value: "" },
        { type: "editCell", rowId: 2, varId: 5, key: "expr", value: "PRC * 2" },
        { type: "editCell", rowId: 4, varId: 5, key: "expr", value: "0.95" },
        { type: "editCell", rowId: 4, varId: 6, key: "expr", value: "X > 1" },
      );
      expect(s2.rows[0].cells[6]).toEqual({ expr: "COIL_THK > 2" });
      expect(s2.rows[0].cells[5]).toBeUndefined();
      expect(s2.rows[1].cells[6]).toEqual({ expr: "COIL_WID > 1000" });
      expect(s2.rows[1].cells[5]).toEqual({ expr: "PRC * 2" });
      expect(s2.rows[3].cells).toEqual({ 4: { val: "C" }, 5: { expr: "0.95" } });
      const s3 = run(s2, { type: "editCell", rowId: 2, varId: 6, key: "expr", value: " " }, { type: "editCell", rowId: 1, varId: 6, key: "na", value: true });
      expect(s3.rows[1].cells[6]).toEqual({ op: "NA" });
      expect(s3.rows[0].cells[6]).toEqual({ op: "NA" });
      expect(isDirty(s2)).toBe(true);
    });

    it("나중에 더한 조건 식 열: 셀이 없는 행에 식을 넣거나 무관을 켜면 셀이 생긴다", () => {
      const s = initTableState(exprView());
      expect(s.rows[2].cells[6]).toBeUndefined();
      const typed = run(s, { type: "editCell", rowId: 3, varId: 6, key: "expr", value: "COIL_WID > 900" });
      expect(typed.rows[2].cells[6]).toEqual({ expr: "COIL_WID > 900" });
      const na = run(s, { type: "editCell", rowId: 3, varId: 6, key: "na", value: true });
      expect(na.rows[2].cells[6]).toEqual({ op: "NA" });
      expect(saveRowsOf(na)[2].cells).toBe('{"1":{"op":"LT","left":"1.6"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"C"},"6":{"op":"NA"}}');
    });

    it("같은 식을 다시 넣으면 상태가 그대로다(서버 AST 도 남는다)", () => {
      const s = initTableState(exprView());
      expect(run(s, { type: "editCell", rowId: 1, varId: 6, key: "expr", value: "COIL_THK > 1 " })).toBe(s);
      expect(run(s, { type: "editCell", rowId: 2, varId: 6, key: "expr", value: "" })).toBe(s);
      expect(run(s, { type: "editCell", rowId: 2, varId: 6, key: "na", value: true })).toBe(s);
      expect(run(s, { type: "editCell", rowId: 1, varId: 6, key: "na", value: false })).toBe(s);
      expect(isDirty(s)).toBe(false);
    });

    it("저장 본문: 편집한 식 칸에는 ast 가 없고 손대지 않은 칸은 서버 AST 를 그대로 싣는다", () => {
      const s = initTableState(exprView());
      const s2 = run(s, { type: "editCell", rowId: 1, varId: 6, key: "expr", value: "COIL_THK > 2" }, { type: "editCell", rowId: 4, varId: 5, key: "expr", value: "0.95" });
      const body = saveRowsOf(s2);
      expect(body[0].cells).toBe('{"1":{"op":"GE","left":"1.6"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"A"},"5":{"expr":"1.05","ast":{"type":"X"}},"6":{"expr":"COIL_THK > 2"}}');
      expect(body[3].cells).toBe('{"4":{"val":"C"},"5":{"expr":"0.95"}}');
      expect(body[1].cells).toBe(exprView().rows[1].cells);
    });

    it("즉시 검사: ast 없는 조건 식 칸도 던지지 않고 서버 AST 가 있을 때와 같은 이슈(화면에서 못 푸는 칸)를 낸다", () => {
      const s = run(initTableState(exprView()), { type: "editCell", rowId: 2, varId: 6, key: "expr", value: "COIL_WID > 1000" });
      const a = tableAnalysis(s);
      expect(a.failed).toBe(false);
      expect(a.issues.some((i) => i.code === "UNRESOLVED_CELL" && i.varId === 6 && i.rowIds[0] === 2)).toBe(true);
      const rows = tableStoredRows(s).map((r) => ({ ...r, cells: r.cells.replace('{"expr":"COIL_WID > 1000"}', '{"expr":"COIL_WID > 1000","ast":{"type":"X"}}') }));
      expect(rows[1].cells).toContain('"ast"');
      expect(runAnalysis(s.ruleId, "DECISION", "FIRST", s.vars, rows).issues).toEqual(a.issues);
    });
  });

  it("조건·결과 묶음 머리는 IF/THEN 설명과 블록 색(조건 success, 결과 primary 토큰)을 단다(06 시안)", () => {
  const noop = () => {};
  const cols = buildTableColumns({ vars: SAMPLE_VARS, editable: true, onEdit: noop, onSelectRow: noop, onDeleteRow: noop });
  const cond = cols.find((c) => c.key === "grp_cond")!;
  const result = cols.find((c) => c.key === "grp_result")!;
  expect(cond.header).toBe("조건");
  expect(cond.headerComponentParams).toEqual({ title: "조건", hint: "IF · 모든 조건 셀이 참이면" });
  expect(cond.headerStyle).toMatchObject({ background: "var(--color-success-soft)", color: "var(--color-success)" });
  expect(result.header).toBe("결과");
  expect(result.headerComponentParams).toEqual({ title: "결과", hint: "THEN · 결과 변수에 대입" });
  expect(result.headerStyle).toMatchObject({ background: "var(--color-primary-soft-hover)", color: "var(--color-primary-active)" });
  // 결과 변수의 변수·칸 머리는 옅은 파랑, 조건 변수 머리는 칠하지 않는다.
  const resVar = result.children![0];
  expect(resVar.headerStyle).toEqual({ background: "var(--color-primary-soft)" });
  expect(resVar.children!.every((leaf) => leaf.headerStyle?.background === "var(--color-primary-soft)")).toBe(true);
  expect(cond.children![0].headerStyle).toBeUndefined();
});

it("결과 열 그룹은 결과 → 그룹(사전 표시명·이름) → 변수 4줄 머리로 묶고, 열 조건은 변수 머리 툴팁에 붙인다", () => {
  const noop = () => {};
  const res = (varId: number, seq: number, varName: string) =>
    ({ ...SAMPLE_VARS[3], varId, seq, varName, label: varName, description: null }) as (typeof SAMPLE_VARS)[number];
  // seq 순: X(그룹 G) · Y(그룹 G, 기본 열) · Z(그룹 밖) · W(그룹 G — 떨어져 나와 따로 묶인다)
  const vars = [SAMPLE_VARS[0], res(11, 1, "X"), res(12, 2, "Y"), res(13, 3, "Z"), res(14, 4, "W")];
  const cols = buildTableColumns({
    vars,
    varMeta: [
      { varId: 11, resGrp: "G", grpCond: 'TOP_RESIN_CD == "F"' },
      { varId: 12, resGrp: "G", grpCond: null },
      { varId: 14, resGrp: "G", grpCond: "A > 1" },
    ],
    candidates: [{ name: "G", label: "기준 속도", kind: "COLUMN" }],
    editable: false,
    onEdit: noop,
    onSelectRow: noop,
    onDeleteRow: noop,
  });
  const result = cols.find((c) => c.key === "grp_result")!;
  expect(result.children!.map((c) => c.key)).toEqual(["res_grp_G_0", "v13", "res_grp_G_3"]);
  const g = result.children![0];
  expect(g.headerComponentParams).toEqual({ title: "기준 속도", name: "G", hint: "열 조건으로 한 열을 고른다" });
  expect(g.headerStyle).toMatchObject({ background: "var(--c-blue-150)" });
  expect(g.children!.map((c) => c.key)).toEqual(["v11", "v12"]);
  expect(g.children![0].headerTooltip).toContain('열 조건 TOP_RESIN_CD == "F"');
  expect(g.children![1].headerTooltip).toContain("기본 열(열 조건 없음)");
  // 사전에 없는 그룹 이름은 이름만 보인다. 조건 쪽은 그대로 조건 → 변수.
  const noLabel = buildTableColumns({ vars, varMeta: [{ varId: 11, resGrp: "G" }, { varId: 12, resGrp: "G" }], editable: false, onEdit: noop, onSelectRow: noop, onDeleteRow: noop });
  expect(noLabel.find((c) => c.key === "grp_result")!.children![0].headerComponentParams).toMatchObject({ title: "G", name: undefined });
  expect(cols.find((c) => c.key === "grp_cond")!.children!.map((c) => c.key)).toEqual(["v1"]);
});

it("칸 잠금: 기본 행의 조건 칸, 구간이 아닌 상한, 값 없는 op 의 값, 편집 불가 버전", () => {
    const [thk, wid] = SAMPLE_VARS;
    const rows = s0.rows;
    expect(cellEditable(thk, "op", rows[3], true)).toBe(false);
    expect(cellEditable(thk, "right", rows[0], true)).toBe(true);
    expect(cellEditable(thk, "right", rows[2], true)).toBe(false);
    expect(cellEditable(wid, "left", rows[2], true)).toBe(false);
    expect(cellEditable(wid, "left", rows[0], true)).toBe(true);
    expect(cellEditable(thk, "op", rows[0], false)).toBe(false);
    expect(cellEditable(SAMPLE_VARS[3], "val", rows[3], true)).toBe(true);
  });

  it("나중에 더한 Equal 조건 열은 셀이 없는 기존 행에서도 값을 넣을 수 있다", () => {
    const coil = { ...SAMPLE_VARS[0], varId: 10, dispType: "Equal" as const, seq: 9, varName: "COIL", dataType: "STRING" as const };
    const view = draftView("e2e_mdm_steward", "e2e_mdm_steward", { vars: [...SAMPLE_VARS, coil] });
    const s = initTableState(view);
    expect(s.rows[0].cells[10]).toBeUndefined();
    expect(cellEditable(coil, "left", s.rows[0], true)).toBe(true);
    expect(cellEditable(coil, "left", { ...s.rows[0], cells: { ...s.rows[0].cells, 10: { op: "NA" } } }, true)).toBe(false);
    const s2 = run(s, { type: "editCell", rowId: 1, varId: 10, key: "left", value: " HR " });
    expect(s2.rows[0].cells[10]).toEqual({ op: "EQ", left: "HR" });
  });

  it("산출(DERIVE) 룰은 행 추가·기본 행 추가를 받지 않는다", () => {
    const s = initTableState(draftView("e2e_mdm_steward", "e2e_mdm_steward", { rule: { ...draftView(null).rule, ruleKind: "DERIVE" } }));
    expect(run(s, { type: "addRow" }, { type: "addDefaultRow" }).rows).toEqual(s.rows);
  });

  it("행 복사는 원본 바로 아래에 셀·설명을 깊은 복사한 새 행을 넣고 고르며, 기본 행은 복사하지 않는다", () => {
    const s = run(s0, { type: "copyRow", rowId: 1 });
    expect(s.rows.map((r) => [r.rowId, r.seq, r.rowKind])).toEqual([
      [1, 1, "NORMAL"],
      [-1, 2, "NORMAL"],
      [2, 3, "NORMAL"],
      [3, 4, "NORMAL"],
      [4, 0, "DEFAULT"],
    ]);
    expect(s.rows[1].cells).toEqual(s0.rows[0].cells);
    expect(s.rows[1].note).toBe(s0.rows[0].note);
    expect(s.selectedRowId).toBe(-1);
    const edited = run(s, { type: "editCell", rowId: -1, varId: 1, key: "left", value: "9" });
    expect(edited.rows[0].cells).toEqual(s0.rows[0].cells);
    expect(run(s0, { type: "copyRow", rowId: 4 }).rows).toEqual(s0.rows);
    expect(run(s, { type: "copyRow", rowId: 1 }).rows[1].rowId).toBe(-2);
  });

  it("기본 행은 없을 때만 더한다", () => {
    expect(run(s0, { type: "addDefaultRow" }).rows).toEqual(s0.rows);
    const s = run(s0, { type: "deleteRow", rowId: 4 }, { type: "addDefaultRow" });
    expect(s.rows.at(-1)).toMatchObject({ rowId: -1, rowKind: "DEFAULT", seq: 0 });
  });

  it("편집 불가 상태에서는 어떤 편집도 받지 않는다", () => {
    const s = initTableState(draftView("e2e_mdm_steward2"));
    const s2 = run(
      s,
      { type: "addRow" },
      { type: "editCell", rowId: 1, varId: 2, key: "left", value: "1" },
      { type: "deleteRow", rowId: 1 },
      { type: "setHitPolicy", value: "UNIQUE" },
      { type: "reorder", keys: ["2", "1"] },
    );
    expect(s2.rows).toEqual(s.rows);
    expect(s2.hitPolicy).toBe(s.hitPolicy);
  });

  it("저장 본문 행: 보이는 순서, 음수 임시 ID, cells 문자열, 설명", () => {
    const s = run(s0, { type: "addRow" }, { type: "editCell", rowId: -1, varId: 4, key: "val", value: "D" }, { type: "editNote", rowId: -1, value: "새 행" });
    expect(saveRowsOf(s)).toEqual([
      { rowId: 1, rowKind: "NORMAL", cells: draftView(null).rows[0].cells, note: "광폭 A급" },
      { rowId: 2, rowKind: "NORMAL", cells: draftView(null).rows[1].cells, note: "광폭 B급" },
      { rowId: 3, rowKind: "NORMAL", cells: draftView(null).rows[2].cells, note: "후물" },
      { rowId: -1, rowKind: "NORMAL", cells: '{"1":{"op":"NA"},"2":{"op":"NA"},"3":{"op":"NA"},"4":{"val":"D"}}', note: "새 행" },
      { rowId: 4, rowKind: "DEFAULT", cells: draftView(null).rows[3].cells, note: null },
    ]);
  });
});

describe("분석 결과 나누기·견주기", () => {
  it("분석기가 예외를 던지면 화면을 깨지 않고 '분석 불가'로 돌려준다", () => {
    const r = runAnalysis(
      "T",
      "DECISION",
      "FIRST",
      [{ varId: 1, varKind: "COND", dispType: "1", seq: 1, varName: "V", exprVar: false, dataType: "STRING", dateString: false, typeSource: "COLUMN" }],
      [
        { rowId: 1, seq: 1, rowKind: "NORMAL", cells: '{"1":{"op":"EQ"}}' },
        { rowId: 2, seq: 2, rowKind: "NORMAL", cells: '{"1":{"op":"EQ","left":"A"}}' },
      ],
    );
    expect(r.failed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.failure).toBeTruthy();
  });

  it("표 단위(VALUE_GAP·NULL_GAP)·칸 단위(varId 가 있는 행 이슈)·행 단위로 나눈다", () => {
    const issues: RuleIssueView[] = [
      { code: "ALL_NA_ROW", severity: "ERROR", rowIds: [5] },
      { code: "UNRESOLVED_CELL", severity: "WARNING", rowIds: [2], varId: 3 },
      { code: "OVERLAP", severity: "WARNING", rowIds: [1, 2] },
      { code: "VALUE_GAP", severity: "WARNING", rowIds: [1, 2], varId: 1, lower: "2.50", upper: "2.50" },
      { code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: 1 },
    ];
    const s = splitIssues(issues);
    expect(s.table.map((i) => i.code)).toEqual(["VALUE_GAP", "NULL_GAP"]);
    expect(s.byCell.get("2:3")).toBe("WARNING");
    expect(s.byRow.get(5)).toEqual({ errors: 1, warnings: 0 });
    expect(s.byRow.get(2)).toEqual({ errors: 0, warnings: 2 });
    expect(s.byRow.get(1)).toEqual({ errors: 0, warnings: 1 });
  });

  it("sameIssues 는 message 를 빼고 순서까지 견주며 없는 칸과 null 을 같게 본다", () => {
    const a: RuleIssueView[] = [{ code: "OVERLAP", severity: "WARNING", rowIds: [1, 2], message: "가" }];
    const b: RuleIssueView[] = [{ code: "OVERLAP", severity: "WARNING", rowIds: [1, 2], varId: null, lower: null, message: "나" }];
    expect(sameIssues(a, b)).toBe(true);
    expect(sameIssues(a, [{ ...b[0], severity: "ERROR" }])).toBe(false);
    expect(sameIssues(a, [{ ...b[0], rowIds: [2, 1] }])).toBe(false);
    expect(sameIssues([...a, ...a], a)).toBe(false);
  });

  it("mapRowIds 는 저장 전 임시 ID 를 발급 번호로 바꾼다", () => {
    expect(mapRowIds([{ code: "ALL_NA_ROW", severity: "ERROR", rowIds: [-1, 3] }], { "-1": 5 })).toEqual([
      { code: "ALL_NA_ROW", severity: "ERROR", rowIds: [5, 3] },
    ]);
  });
});

// ── 렌더(그리드 밖) ──

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let saveBodies: Array<Record<string, unknown>> = [];
let saveResponse: unknown;

async function renderCard(view: RuleEditView, writes: { reloads: number } = { reloads: 0 }) {
  const props: RuleEditCardProps = {
    view,
    me: view.me,
    editable: view.editable,
    reload: async () => {
      writes.reloads++;
    },
    selectVer: async () => {},
    notify: () => {},
    runWrite: async (fn) => {
      const r = await fn();
      writes.reloads++;
      return r;
    },
    setDirty: () => {},
    canDo: () => true,
    busy: false,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DecisionTableCard, props)));
  });
  // 그리드 준비(비동기 onGridReady)와 그때의 행 다시 그리기까지 끝난 뒤에 시험을 시작한다.
  await settleGrid(container);
}

describe("DecisionTableCard 렌더", () => {
  beforeEach(() => {
    installDomStorage();
    saveBodies = [];
    saveResponse = {
      meta: { success: true },
      // 코퍼스 grid-new-row-all-na 의 기대값과 같은 서버 검사(값이 없는 칸은 싣지 않는다).
      data: {
        result: {
          part: "TABLE",
          rowVersion: 4,
          rowIdMap: { "-1": 5 },
          issues: [
            { code: "ALL_NA_ROW", severity: "ERROR", rowIds: [5], message: "x" },
            { code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: 1, message: "y" },
            { code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: 3, message: "z" },
          ],
          rows: [],
        },
      },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oasis/ruleEdit/save")) {
        saveBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse(saveResponse);
      }
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      return jsonResponse({}, 404);
    }) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("[크게 보기]는 표 높이를 본문 스크롤 영역만큼 늘리고 [원래 크기]로 행 수에 맞게 되돌린다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    // 카드가 든 본문 스크롤 영역 — happy-dom 은 크기를 재지 않으므로(0) 가장 작은 높이 320 으로 늘어난다.
    container.style.overflowY = "auto";
    const grid = () => container.querySelector<HTMLElement>('[data-testid="dt-grid"]')!;
    const toggle = () => container.querySelector<HTMLButtonElement>('[data-testid="dt-expand"]')!;
    const fit = grid().style.height;
    expect(toggle().textContent).toBe("크게 보기");
    await act(async () => {
      toggle().click();
    });
    expect(toggle().textContent).toBe("원래 크기");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(grid().style.height).toBe("320px");
    await act(async () => {
      toggle().click();
    });
    expect(toggle().textContent).toBe("크게 보기");
    expect(grid().style.height).toBe(fit);
  });

  it("행 추가를 누르면 ALL_NA_ROW 오류와 저장 안 한 변경 배지가 보이고, 되돌리기로 사라진다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    expect(visibleText(container)).not.toContain("저장 안 한 변경");
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    expect(visibleText(container)).toContain("ALL_NA_ROW");
    expect(visibleText(container)).toContain("저장 안 한 변경");
    await act(async () => {
      findButton(container, "되돌리기").click();
    });
    expect(visibleText(container)).not.toContain("ALL_NA_ROW");
    expect(visibleText(container)).not.toContain("저장 안 한 변경");
  });

  it("검사·표 단위 검사는 접을 수 있고, 접혀도 오류·경고 개수는 제목 줄에 보인다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    expect(q("dt-check-body").hidden).toBe(false);
    expect(q("dt-check-table-body").hidden).toBe(false);
    await act(async () => q("dt-check-table-toggle").click());
    expect(q("dt-check-table-body").hidden).toBe(true);
    expect(q("dt-check-table-toggle").getAttribute("aria-expanded")).toBe("false");
    await act(async () => q("dt-check-toggle").click());
    expect(q("dt-check-body").hidden).toBe(true);
    expect(q("dt-check-count").textContent).toMatch(/^오류 \d+ · 경고 \d+$/);
    await act(async () => q("dt-check-toggle").click());
    expect(q("dt-check-body").hidden).toBe(false);
    expect(q("dt-check-table-body").hidden).toBe(true);
  });

  // D-133 — 표 저장 요청에 지금 적중 정책을 싣는다(서버가 같은 트랜잭션에 저장, 같으면 쓰지 않는다).
  it("저장 요청은 part TABLE·row_version·적중 정책과 grids.rows.rows(순서·음수 임시 ID·cells 문자열)다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    await act(async () => {
      findButton(container, "표 저장").click();
    });
    await flush();
    expect(saveBodies).toHaveLength(1);
    const body = saveBodies[0] as { params: Record<string, unknown>; grids: { rows: { rows: Array<Record<string, unknown>> } } };
    expect(body.params).toEqual({ part: "TABLE", maruRuleId: "QLTY_GRD_JDG", ver: "2.000", rowVersion: 3, hitPolicy: "FIRST" });
    expect(body.grids.rows.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);
    expect(body.grids.rows.rows[3]).toEqual({ rowId: -1, rowKind: "NORMAL", cells: '{"1":{"op":"NA"},"2":{"op":"NA"},"3":{"op":"NA"}}' });
    expect(typeof body.grids.rows.rows[0].cells).toBe("string");
    // 저장 전 화면 검사(임시 ID → 발급 번호)와 서버 검사가 같다.
    expect(visibleText(container)).toContain("화면·서버 검사 일치");
  });

  it("적중 정책을 고르면 저장 안 한 변경이 되고 [표 저장] 한 번에 행과 함께 실려 간다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    const select = () => container.querySelector<HTMLSelectElement>("[data-testid='dt-hit-policy']")!;
    expect(select().disabled).toBe(false);
    expect(select().value).toBe("FIRST");
    expect(container.querySelector("[data-testid='dt-dirty']")).toBeNull();
    await selectValue(select(), "UNIQUE");
    expect(container.querySelector("[data-testid='dt-dirty']")).not.toBeNull();
    expect(container.querySelector("[data-testid='dt-hit-policy-changed']")?.textContent).toContain("FIRST → UNIQUE");
    await act(async () => {
      findButton(container, "표 저장").click();
    });
    await flush();
    expect(saveBodies).toHaveLength(1);
    expect((saveBodies[0] as { params: Record<string, unknown> }).params.hitPolicy).toBe("UNIQUE");
    // 되돌리기는 정책까지 되돌린다.
    await selectValue(select(), "COLLECT");
    await act(async () => {
      findButton(container, "되돌리기").click();
    });
    expect(select().value).toBe("FIRST");
  });

  it("편집할 수 없거나(내 DRAFT 가 아님) 저장 권한이 없으면 적중 정책을 고를 수 없다", async () => {
    await renderCard(draftView("someone_else"));
    expect(container.querySelector<HTMLSelectElement>("[data-testid='dt-hit-policy']")!.disabled).toBe(true);
  });

  it("바꾼 정책이 저장된 열 설정과 어긋나면 열 설정 검사 문구로 알리고 [표 저장] 을 막는다", async () => {
    const base = draftView("e2e_mdm_steward");
    await renderCard({
      ...base,
      versions: base.versions.map((v) => (v.ver === "2.000" ? { ...v, hitPolicy: "COLLECT" } : v)),
      varMeta: [{ varId: 4, collectAgg: "SUM" }],
    });
    expect(container.querySelector("[data-testid='dt-hit-policy-conflicts']")).toBeNull();
    await selectValue(container.querySelector<HTMLSelectElement>("[data-testid='dt-hit-policy']")!, "FIRST");
    const conflicts = container.querySelector("[data-testid='dt-hit-policy-conflicts']");
    expect(conflicts?.textContent).toContain("집계는 COLLECT 적중 정책의 결과 열에만 둡니다");
    expect(findButton(container, "표 저장").disabled).toBe(true);
    // 다시 COLLECT 로 고르면 풀린다.
    await selectValue(container.querySelector<HTMLSelectElement>("[data-testid='dt-hit-policy']")!, "COLLECT");
    expect(container.querySelector("[data-testid='dt-hit-policy-conflicts']")).toBeNull();
  });

  it("행 복사는 행 번호로 고른 행을 바로 아래에 복사하고 저장 요청에 음수 임시 ID 로 싣는다(고르지 않았거나 기본 행이면 꺼짐)", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    const copy = () => container.querySelector("[data-testid='dt-copy-row']") as HTMLButtonElement;
    expect(copy().disabled).toBe(true);
    await act(async () => (container.querySelector("[data-testid='dt-row-4']") as HTMLButtonElement).click());
    expect(copy().disabled).toBe(true);
    await act(async () => (container.querySelector("[data-testid='dt-row-2']") as HTMLButtonElement).click());
    expect(copy().disabled).toBe(false);
    await act(async () => copy().click());
    await act(async () => {
      findButton(container, "표 저장").click();
    });
    await flush();
    const body = saveBodies[0] as { grids: { rows: { rows: Array<Record<string, unknown>> } } };
    expect(body.grids.rows.rows.map((r) => r.rowId)).toEqual([1, 2, -1, 3, 4]);
    expect(body.grids.rows.rows[2].cells).toBe(body.grids.rows.rows[1].cells);
  });

  it("서버 검사가 화면과 다르면 서버 결과가 기준이라고 알린다", async () => {
    saveResponse = { meta: { success: true }, data: { result: { part: "TABLE", rowVersion: 4, rowIdMap: {}, issues: [], rows: [] } } };
    await renderCard(draftView("e2e_mdm_steward"));
    await act(async () => {
      findButton(container, "행 추가").click();
    });
    await act(async () => {
      findButton(container, "표 저장").click();
    });
    await flush();
    expect(visibleText(container)).toContain("서버 결과가 기준");
  });

  it("편집할 수 없는 버전이면 행 추가·표 저장이 꺼진다", async () => {
    await renderCard(draftView("e2e_mdm_steward2"));
    expect(findButton(container, "행 추가").disabled).toBe(true);
    expect(findButton(container, "표 저장").disabled).toBe(true);
  });

  // 기능설계서 「강조」 — 선택 행의 `-` 가 아닌 조건 칸(테두리, cell-emphasis). f7d9c47a 가 고른 행을 표시 행에서 빼며 규칙까지 지웠다.
  // 고른 행은 여전히 표시 행·토큰에 싣지 않는다(Local-Rules §16) — highlightedRowKey 가 이전·새 행 둘만 다시 그릴 때 규칙이 다시 판정한다.
  it("행을 고르면 그 행의 - 가 아닌 조건 칸만 강조하고, 다른 행을 고르면 옮겨 가며 나머지 행은 다시 그리지 않는다", async () => {
    await renderCard(draftView("e2e_mdm_steward"));
    const cell = (rowId: number, colId: string) =>
      container.querySelector<HTMLElement>(`.ag-center-cols-container .ag-row[row-id='${rowId}'] [col-id='${colId}']`);
    const emphasized = (rowId: number, colId: string) => {
      const c = cell(rowId, colId);
      expect(c, `행 ${rowId} ${colId} 칸`).toBeTruthy();
      return c!.classList.contains("cell-emphasis");
    };
    const rowEl = (rowId: number) => container.querySelector(`.ag-center-cols-container .ag-row[row-id='${rowId}']`);
    /** `pick` 동안 DOM 이 바뀐 행 ID — 행 요소가 붙거나 떨어진 행(redrawRows), 행 안 칸 내용이 바뀐 행(렌더러 다시 만들기 등). 고정 열 쪽 행도 센다. */
    const redrawnRows = async (pick: () => Promise<void>): Promise<string[]> => {
      const ids = new Set<string>();
      const rowIdOf = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest(".ag-row")?.getAttribute("row-id");
      const collect = (records: MutationRecord[]) => {
        for (const r of records) {
          const inside = rowIdOf(r.target);
          if (inside) ids.add(inside);
          for (const n of [...r.addedNodes, ...r.removedNodes]) {
            const id = n instanceof Element && n.matches(".ag-row") ? n.getAttribute("row-id") : null;
            if (id) ids.add(id);
          }
        }
      };
      const mo = new MutationObserver(collect);
      mo.observe(container.querySelector(".ag-root-wrapper")!, { childList: true, subtree: true, characterData: true });
      await pick();
      collect(mo.takeRecords());
      mo.disconnect();
      return [...ids].sort();
    };
    expect(emphasized(3, "c1_op")).toBe(false);
    const untouched = rowEl(2);
    expect(untouched).toBeTruthy();

    // 행 3 을 고르면 행 3 만 다시 그린다(앞서 고른 행 없음).
    const first = await redrawnRows(async () => {
      await act(async () => (container.querySelector("[data-testid='dt-row-3']") as HTMLButtonElement).click());
      await flush();
    });
    expect(first).toEqual(["3"]);
    // 행 3: 두께 GE·표면등급 NOT_IN 은 강조, 폭은 NA 라 강조하지 않는다. 고르지 않은 행 1 은 그대로.
    expect(emphasized(3, "c1_op")).toBe(true);
    expect(emphasized(3, "c1_left")).toBe(true);
    expect(emphasized(3, "c3_op")).toBe(true);
    expect(emphasized(3, "c2_op")).toBe(false);
    expect(emphasized(1, "c1_op")).toBe(false);
    // 결과 열은 조건이 아니다.
    expect(emphasized(3, "c4_val")).toBe(false);

    // 행 1 로 옮기면 이전·새 행(3·1)만 다시 그린다. 고르기에 끼지 않은 행 2·기본 행 4 는 DOM 이 그대로다.
    const second = await redrawnRows(async () => {
      await act(async () => (container.querySelector("[data-testid='dt-row-1']") as HTMLButtonElement).click());
      await flush();
    });
    expect(second).toEqual(["1", "3"]);
    expect(emphasized(1, "c1_op")).toBe(true);
    expect(emphasized(1, "c2_op")).toBe(true);
    expect(emphasized(3, "c1_op")).toBe(false);
    expect(emphasized(3, "c3_op")).toBe(false);
    // 고르기에 끼지 않은 행 2 는 DOM 이 그대로다 — 고를 때마다 표 전체를 다시 그리지 않는다(§16 성능 목표).
    expect(rowEl(2)).toBe(untouched);
  });

  it("산출 룰은 행 추가 버튼 없이 안내를 보인다", async () => {
    await renderCard(draftView("e2e_mdm_steward", "e2e_mdm_steward", { rule: { ...draftView(null).rule, ruleKind: "DERIVE" } }));
    expect(() => findButton(container, "행 추가")).toThrow();
    expect(visibleText(container)).toContain("산출 룰은 열 설정");
  });
});

// 포털 탭은 화면을 React StrictMode(개발 모드)와 MDM 메타 공급자(MdmMetaProvider) 아래에 그린다. mdm 모듈은 mdmMeta 가 404 라 모듈이 꺼지지만
// (2026-10-05 부터 실제 mdm 포털 탭은 공급자를 미리 꺼 요청·loading 이 없다. 이 시험은 module "mdm" + 404 로 지원 모듈 탭의 loading → 없음 전환을 재현한다)
// 새 열 목록마다 칸 메타가 loading → 없음으로 한 번 바뀐다 — 그때 그리드가 같은 열 정의를 다시 넣어, 머리 그룹 칸이 처음 붙는 커밋에서
// `getProvidedColumnGroup of null` 로 화면이 깨졌다(2026-10-03, 열 없는 룰에 첫 열 적용). 그리드 열(그룹 머리·변수 머리·칸)까지 그린다.
describe("DecisionTableCard — 포털 탭(StrictMode·MDM 메타 공급자)에서 열 구조 바꾸기", () => {
  const me = "e2e_mdm_steward";
  let errors: string[] = [];

  function cardProps(view: RuleEditView): RuleEditCardProps {
    return {
      view,
      me: view.me,
      editable: view.editable,
      reload: async () => {},
      selectVer: async () => {},
      notify: () => {},
      runWrite: async (fn) => fn(),
      setDirty: () => {},
      canDo: () => true,
      busy: false,
    };
  }
  /** 열 구조만 바꾼 DRAFT view(행 없음) — 저장·다시 불러오기 뒤 view 와 같은 모양. */
  function structureView(varIds: number[]): RuleEditView {
    return draftView(me, me, {
      vars: SAMPLE_VARS.filter((v) => varIds.includes(v.varId)),
      rows: [],
      baseRows: [],
      varMeta: varIds.map((varId) => ({ varId, resGrp: null, grpCond: null })),
    });
  }
  /** 그리고 메타 묶음 요청(16ms)·404 응답·loading → 없음 전환까지 기다린다. act 가 모은 예외도 errors 로 모은다. */
  async function show(view: RuleEditView) {
    try {
      await act(async () => {
        root!.render(
          createElement(
            StrictMode,
            null,
            createElement(DmesUiProvider, null, createElement(MdmMetaProvider, { module: "mdm" }, createElement(DecisionTableCard, cardProps(view))))
          )
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
    } catch (e) {
      for (const x of e instanceof AggregateError ? e.errors : [e]) errors.push(String((x as Error)?.message ?? x));
    }
  }
  const varHeads = () => [...container.querySelectorAll("[data-testid^='dt-var-header-']")].map((el) => el.getAttribute("data-testid"));
  const groupText = () => [...container.querySelectorAll(".ag-header-group-cell")].map((el) => visibleText(el)).join(" ");

  beforeEach(() => {
    installDomStorage();
    resetMdmMetaStore();
    errors = [];
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 404)) as typeof fetch;
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container, { onUncaughtError: (e) => errors.push(String((e as Error)?.message ?? e)) });
  });
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
  });

  it("열이 없던 룰에 조건·결과 열을 처음 적용해도 화면이 깨지지 않고 두 묶음·변수 머리가 보인다", async () => {
    await show(structureView([]));
    expect(varHeads()).toEqual([]);
    await show(structureView([1, 4]));
    expect(errors).toEqual([]);
    expect(varHeads()).toEqual(["dt-var-header-1", "dt-var-header-4"]);
    expect(groupText()).toContain("조건");
    expect(groupText()).toContain("결과");
  });

  it("결과 묶음을 더하고 조건 묶음을 지워도(열 구조 바꾸기) 화면이 깨지지 않는다", async () => {
    await show(structureView([1]));
    expect(groupText()).not.toContain("결과");
    await show(structureView([1, 4, 5]));
    expect(varHeads()).toEqual(["dt-var-header-1", "dt-var-header-4", "dt-var-header-5"]);
    await show(structureView([4, 5]));
    expect(varHeads()).toEqual(["dt-var-header-4", "dt-var-header-5"]);
    expect(groupText()).not.toContain("조건");
    expect(errors).toEqual([]);
  });

  it("고른 행의 조건 칸 강조(cell-emphasis)는 메타 응답 뒤에도 남고 다른 행으로 옮겨 간다", async () => {
    await show(draftView(me));
    const emphasized = (rowId: number, colId: string) => {
      const c = container.querySelector<HTMLElement>(`.ag-center-cols-container .ag-row[row-id='${rowId}'] [col-id='${colId}']`);
      expect(c, `행 ${rowId} ${colId} 칸`).toBeTruthy();
      return c!.classList.contains("cell-emphasis");
    };
    await act(async () => (container.querySelector("[data-testid='dt-row-3']") as HTMLButtonElement).click());
    await flush();
    expect(emphasized(3, "c1_op")).toBe(true);
    expect(emphasized(3, "c2_op")).toBe(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(emphasized(3, "c1_op")).toBe(true);
    await act(async () => (container.querySelector("[data-testid='dt-row-1']") as HTMLButtonElement).click());
    await flush();
    expect(emphasized(1, "c1_op")).toBe(true);
    expect(emphasized(3, "c1_op")).toBe(false);
    expect(errors).toEqual([]);
  });
});
