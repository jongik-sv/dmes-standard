// TSK-08-04 design §2.5·§6.7·I33 — 값 테스트 표 칠하기. 서버 결과(적중 행·첫 거짓 칸·그룹 고른 열)만으로 칠하고, 이 카드가 보이는
// 정의(BODY 는 같은 rev, VERSION 은 같은 버전·같은 row_version·저장 안 한 변경 없음)일 때만 표에 올린다. BODY 결과 뒤 표가 바뀌면 지운다.
import { describe, expect, it } from "vitest";

import { displayRows, type TableMarks } from "../../../pages/dme/ruleEdit/decision-table/columns";
import { gridRowsFromStored } from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import {
  INITIAL_WORKBENCH,
  workbenchReducer,
  type TableDraft,
  type WorkbenchState,
} from "../../../pages/dme/ruleEdit/state/workbench-context";
import type { ValueTestResult } from "../../../pages/dme/ruleEdit/types";
import {
  runShownOnTable,
  testMarksOf,
  testRunAfterTableChange,
  type TestRunView,
} from "../../../pages/dme/ruleEdit/value-test/test-marks";
import { SAMPLE_ROWS, SAMPLE_VARS } from "./fixtures";

function result(over: Partial<ValueTestResult> = {}): ValueTestResult {
  return {
    target: "BODY",
    ver: "2.000",
    evalTs: "2026-09-26 10:00:00",
    outcome: "OK",
    results: { QLTY_GRD: "B", PRC_FCT: "1.00" },
    hits: [{ rowId: 2, seq: 2, groupChoices: {} }],
    defaultApplied: false,
    trace: [
      { rowId: 1, seq: 1, evaluated: true, hit: false, firstFalseVarId: 3 },
      { rowId: 2, seq: 2, evaluated: true, hit: true, firstFalseVarId: null },
      { rowId: 3, seq: 3, evaluated: false, hit: false, firstFalseVarId: null },
    ],
    ...over,
  };
}

function run(over: Partial<TestRunView> = {}): TestRunView {
  return { ruleId: "QLTY_GRD_JDG", target: "BODY", ver: "2.000", rowVersion: 3, rev: 1, result: result(), ...over };
}

describe("testMarksOf", () => {
  it("적중 행과 평가했지만 적중하지 않은 행의 첫 거짓 칸을 모은다", () => {
    const m = testMarksOf(result(), SAMPLE_VARS, [], 4);
    expect([...m.hitRowIds]).toEqual([2]);
    expect([...m.firstFalse]).toEqual([[1, 3]]);
    expect(m.chosen.size).toBe(0);
    expect(m.dimmed.size).toBe(0);
  });

  it("적중한 행의 firstFalseVarId 와 평가하지 않은 행은 칠하지 않는다", () => {
    const m = testMarksOf(
      result({
        trace: [
          { rowId: 2, seq: 2, evaluated: true, hit: true, firstFalseVarId: 1 },
          { rowId: 3, seq: 3, evaluated: false, hit: false, firstFalseVarId: 2 },
        ],
      }),
      SAMPLE_VARS,
      [],
      4,
    );
    expect(m.firstFalse.size).toBe(0);
  });

  it("기본 행이 적용되면(엔진 hits 는 비어 있다) 표시 중인 정의의 기본 행을 적중 행으로 칠한다", () => {
    const m = testMarksOf(result({ hits: [], defaultApplied: true }), SAMPLE_VARS, [], 4);
    expect([...m.hitRowIds]).toEqual([4]);
    expect([...testMarksOf(result({ hits: [], defaultApplied: true }), SAMPLE_VARS, [], null).hitRowIds]).toEqual([]);
  });

  it("그룹 고른 열은 그 적중 행에서 강조, 같은 그룹 나머지 열은 흐림 — 행마다 따로 센다", () => {
    const meta = [
      { varId: 4, resGrp: "G" },
      { varId: 5, resGrp: "G" },
    ];
    const m = testMarksOf(
      result({
        hits: [
          { rowId: 1, seq: 1, groupChoices: { G: 5 } },
          { rowId: 2, seq: 2, groupChoices: { G: 4 } },
        ],
      }),
      SAMPLE_VARS,
      meta,
      4,
    );
    expect([...m.chosen.get(1)!]).toEqual([5]);
    expect([...m.dimmed.get(1)!]).toEqual([4]);
    expect([...m.chosen.get(2)!]).toEqual([4]);
    expect([...m.dimmed.get(2)!]).toEqual([5]);
  });

  it("그룹에서 고른 열이 없으면(null) 그 그룹 열을 모두 흐리게 한다", () => {
    const meta = [
      { varId: 4, resGrp: "G" },
      { varId: 5, resGrp: "G" },
    ];
    const m = testMarksOf(result({ hits: [{ rowId: 2, seq: 2, groupChoices: { G: null } }] }), SAMPLE_VARS, meta, 4);
    expect(m.chosen.get(2)).toBeUndefined();
    expect([...m.dimmed.get(2)!]).toEqual([4, 5]);
  });

  it("판정 오류 결과(hits·trace 없음)는 아무것도 칠하지 않는다", () => {
    const m = testMarksOf(result({ outcome: "ERROR", hits: undefined, trace: undefined }), SAMPLE_VARS, [], 4);
    expect(m.hitRowIds.size + m.firstFalse.size + m.chosen.size + m.dimmed.size).toBe(0);
  });

  it("판정 오류여도 서버가 행 추적을 실으면(UNIQUE 적중 둘 이상) 맞은 행과 첫 거짓 칸을 칠한다", () => {
    const m = testMarksOf(
      result({
        outcome: "ERROR",
        hits: undefined,
        trace: [
          { rowId: 1, seq: 1, evaluated: true, hit: true, firstFalseVarId: null },
          { rowId: 2, seq: 2, evaluated: true, hit: false, firstFalseVarId: 3 },
          { rowId: 3, seq: 3, evaluated: true, hit: true, firstFalseVarId: null },
        ],
      }),
      SAMPLE_VARS,
      [],
      4,
    );
    expect([...m.hitRowIds]).toEqual([1, 3]);
    expect([...m.firstFalse]).toEqual([[2, 3]]);
  });
});

describe("runShownOnTable (I33)", () => {
  const table = { ruleId: "QLTY_GRD_JDG", ver: "2.000", rowVersion: 3, rev: 1, dirty: true };

  it("BODY 결과는 같은 룰·버전·rev 일 때만 표에 칠한다", () => {
    expect(runShownOnTable(run(), table)).toBe(true);
    expect(runShownOnTable(run({ rev: 0 }), table)).toBe(false);
    expect(runShownOnTable(run({ rev: null }), table)).toBe(false);
    expect(runShownOnTable(run({ ruleId: "OTHER" }), table)).toBe(false);
    expect(runShownOnTable(run({ ver: "1.000" }), table)).toBe(false);
    expect(runShownOnTable(null, table)).toBe(false);
  });

  it("VERSION 결과는 보이는 버전과 같고 row_version 이 같으며 저장 안 한 변경이 없을 때만 칠한다", () => {
    const v = run({ target: "VERSION", rev: null });
    expect(runShownOnTable(v, { ...table, dirty: false })).toBe(true);
    expect(runShownOnTable(v, { ...table, dirty: true })).toBe(false);
    expect(runShownOnTable(run({ target: "VERSION", ver: "1.000", rev: null }), { ...table, dirty: false })).toBe(false);
    expect(runShownOnTable(v, { ...table, dirty: false, rowVersion: 4 })).toBe(false);
    expect(runShownOnTable(v, { ...table, dirty: false, ruleId: "OTHER" })).toBe(false);
  });
});

describe("testRunAfterTableChange", () => {
  const draft = { ruleId: "QLTY_GRD_JDG", ver: "2.000", rev: 2 };

  it("BODY 결과 뒤 표가 바뀌면(rev 다름) 결과를 지우고 안내한다", () => {
    expect(testRunAfterTableChange(run(), draft)).toEqual({ run: null, cleared: true });
    expect(testRunAfterTableChange(run({ rev: 2 }), draft)).toEqual({ run: run({ rev: 2 }), cleared: false });
  });

  it("VERSION 결과는 표 편집으로 지우지 않는다", () => {
    const v = run({ target: "VERSION", rev: null });
    expect(testRunAfterTableChange(v, draft)).toEqual({ run: v, cleared: false });
  });

  it("룰이 바뀌면 조용히 지우고, BODY 결과는 버전이 바뀌어도 조용히 지운다", () => {
    expect(testRunAfterTableChange(run({ target: "VERSION", rev: null }), { ...draft, ruleId: "OTHER" })).toEqual({ run: null, cleared: false });
    expect(testRunAfterTableChange(run(), { ...draft, ver: "1.000" })).toEqual({ run: null, cleared: false });
    expect(testRunAfterTableChange(null, draft)).toEqual({ run: null, cleared: false });
  });
});

describe("workbenchReducer", () => {
  const rows = SAMPLE_ROWS;
  const draft: Omit<TableDraft, "rev"> = { ruleId: "QLTY_GRD_JDG", ver: "2.000", hitPolicy: "FIRST", rows, dirty: false };

  it("같은 내용을 다시 올리면 상태를 그대로 돌려주고, 내용이 바뀌면 rev 를 올린다", () => {
    const s1 = workbenchReducer(INITIAL_WORKBENCH, { type: "publishTable", draft });
    expect(s1.tableDraft?.rev).toBe(1);
    expect(workbenchReducer(s1, { type: "publishTable", draft: { ...draft, rows: [...rows] } })).toBe(s1);
    const s2 = workbenchReducer(s1, { type: "publishTable", draft: { ...draft, hitPolicy: "UNIQUE", dirty: true } });
    expect(s2.tableDraft?.rev).toBe(2);
    const s3 = workbenchReducer(s2, { type: "publishTable", draft: { ...draft, hitPolicy: "UNIQUE", dirty: false } });
    expect(s3.tableDraft?.rev).toBe(2);
    expect(s3.tableDraft?.dirty).toBe(false);
  });

  it("BODY 결과를 받은 뒤 표가 바뀌면 결과가 지워지고 안내 표시가 켜진다. 새 결과를 받으면 안내가 꺼진다", () => {
    const s1 = workbenchReducer(INITIAL_WORKBENCH, { type: "publishTable", draft });
    const s2 = workbenchReducer(s1, { type: "setTestRun", run: run({ rev: s1.tableDraft!.rev }) });
    expect(s2.testRun).not.toBeNull();
    const s3: WorkbenchState = workbenchReducer(s2, { type: "publishTable", draft: { ...draft, rows: rows.slice(1), dirty: true } });
    expect(s3.testRun).toBeNull();
    expect(s3.testRunCleared).toBe(true);
    const s4 = workbenchReducer(s3, { type: "setTestRun", run: run({ rev: s3.tableDraft!.rev }) });
    expect(s4.testRunCleared).toBe(false);
  });

  it("열 설정 초안 dirty 를 싣는다", () => {
    expect(workbenchReducer(INITIAL_WORKBENCH, { type: "setColDirty", dirty: true }).colDirty).toBe(true);
    expect(workbenchReducer(INITIAL_WORKBENCH, { type: "setColDirty", dirty: false })).toBe(INITIAL_WORKBENCH);
  });
});

describe("displayRows 의 값 테스트 표시", () => {
  const baseMarks: TableMarks = {
    diff: { rows: new Map(), deleted: [] },
    split: { byRow: new Map(), byCell: new Map(), table: [] },
    serverShown: true,
  };
  const grid = gridRowsFromStored(SAMPLE_VARS, SAMPLE_ROWS);
  type Mk = Record<number, { t?: string }>;

  it("적중 행은 행 표시와 칸 hit, 첫 거짓 칸은 false, 그룹 고른 열은 chosen·나머지는 dim", () => {
    const test = testMarksOf(
      result({ hits: [{ rowId: 2, seq: 2, groupChoices: { G: 5 } }] }),
      SAMPLE_VARS,
      [
        { varId: 4, resGrp: "G" },
        { varId: 5, resGrp: "G" },
      ],
      4,
    );
    const out = displayRows(grid, SAMPLE_VARS, { ...baseMarks, test });
    const byId = new Map(out.map((r) => [r.rowId as number, r]));
    expect(byId.get(2)!.__hit).toBe(true);
    expect(byId.get(1)!.__hit).toBe(false);
    const mk2 = byId.get(2)!.__mk as Mk;
    expect([mk2[1].t, mk2[4].t, mk2[5].t]).toEqual(["hit", "dim", "chosen"]);
    const mk1 = byId.get(1)!.__mk as Mk;
    expect([mk1[1].t, mk1[3].t]).toEqual([undefined, "false"]);
  });

  it("값 테스트 표시가 없으면 t·적중 행 표시가 없다", () => {
    const out = displayRows(grid, SAMPLE_VARS, baseMarks);
    expect(out.every((r) => r.__hit === false && Object.values(r.__mk as Mk).every((m) => m.t === undefined))).toBe(true);
  });
});
