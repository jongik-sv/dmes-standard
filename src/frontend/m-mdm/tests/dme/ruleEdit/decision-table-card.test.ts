/** @vitest-environment happy-dom */

// TSK-08-02 design §3.2 — 의사결정표 카드 ③. 편집 상태는 순수 reducer(table-state)로 보고, 그리드 즉시 검사가 편집 한 번마다
// evalex `analyzeRule` 을 다시 부르는지(I13)는 그 함수를 감싼 spy 로 확인한다. 렌더 부분은 그리드 밖(버튼·검사 요약·요청 본문)만 본다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

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
  type TableAction,
  type TableState,
} from "../../../pages/dme/ruleEdit/decision-table/table-state";
import { mapRowIds, runAnalysis, sameIssues, splitIssues } from "../../../pages/dme/ruleEdit/decision-table/analysis";
import { cellEditable } from "../../../pages/dme/ruleEdit/decision-table/columns";
import type { RuleEditCardProps } from "../../../pages/dme/ruleEdit/cards";
import type { RuleEditView, RuleIssueView } from "../../../pages/dme/ruleEdit/types";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, visibleText } from "../helpers/render";
import { SAMPLE_VARS, draftView } from "./fixtures";

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

  it("적중 정책 UNIQUE 로 바꾸면 겹침이 오류로 바뀌고 도달 불가는 사라진다", () => {
    const s = run(s0, { type: "editCell", rowId: 2, varId: 3, key: "left", value: "A" }, { type: "setHitPolicy", value: "UNIQUE" });
    const c = codes(s);
    expect(c).toContain("OVERLAP:ERROR:1/2");
    expect(c.some((x) => x.startsWith("UNREACHABLE"))).toBe(false);
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

  it("Expression 셀은 편집으로 바뀌지 않는다(I20)", () => {
    const view = draftView("e2e_mdm_steward", "e2e_mdm_steward", {
      vars: [...SAMPLE_VARS, { ...SAMPLE_VARS[0], varId: 6, dispType: "Expression", seq: 4, varName: "COIL_THK > 1", typeSource: "EXPRESSION_COLUMN", dataType: "STRING" }],
    });
    const s = initTableState(view);
    const s2 = run(s, { type: "editCell", rowId: 1, varId: 6, key: "expr", value: "X > 1" }, { type: "editCell", rowId: 1, varId: 6, key: "na", value: true });
    expect(s2.rows).toEqual(s.rows);
    expect(cellEditable(view.vars[5], "expr", s.rows[0], true)).toBe(false);
    expect(cellEditable(view.vars[5], "na", s.rows[0], true)).toBe(false);
    const withExpr = { ...s.rows[0], cells: { ...s.rows[0].cells, 6: { expr: "COIL_THK > 1", ast: {} } } };
    const withNa = { ...s.rows[0], cells: { ...s.rows[0].cells, 6: { op: "NA" } } };
    for (const row of [withExpr, withNa]) {
      for (const key of ["expr", "na", "op", "left"] as const) expect(cellEditable(view.vars[5], key, row, true), key).toBe(false);
    }
    const resultExpr = { ...SAMPLE_VARS[4], dispType: "Expression" as const };
    expect(cellEditable(resultExpr, "expr", { ...s.rows[0], cells: { 5: { expr: "1.05", ast: {} } } }, true)).toBe(false);
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

  it("산출(DERIVE) 룰은 행 추가·기본 행 추가를 받지 않는다", () => {
    const s = initTableState(draftView("e2e_mdm_steward", "e2e_mdm_steward", { rule: { ...draftView(null).rule, ruleKind: "DERIVE" } }));
    expect(run(s, { type: "addRow" }, { type: "addDefaultRow" }).rows).toEqual(s.rows);
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
  await flush();
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
    expect(body.params).toEqual({ part: "TABLE", maruRuleId: "QLTY_GRD_JDG", ver: 2, rowVersion: 3, hitPolicy: "FIRST" });
    expect(body.grids.rows.rows.map((r) => r.rowId)).toEqual([1, 2, 3, -1, 4]);
    expect(body.grids.rows.rows[3]).toEqual({ rowId: -1, rowKind: "NORMAL", cells: '{"1":{"op":"NA"},"2":{"op":"NA"},"3":{"op":"NA"}}' });
    expect(typeof body.grids.rows.rows[0].cells).toBe("string");
    // 저장 전 화면 검사(임시 ID → 발급 번호)와 서버 검사가 같다.
    expect(visibleText(container)).toContain("화면·서버 검사 일치");
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

  it("산출 룰은 행 추가 버튼 없이 안내를 보인다", async () => {
    await renderCard(draftView("e2e_mdm_steward", "e2e_mdm_steward", { rule: { ...draftView(null).rule, ruleKind: "DERIVE" } }));
    expect(() => findButton(container, "행 추가")).toThrow();
    expect(visibleText(container)).toContain("산출 룰은 열 설정");
  });
});
