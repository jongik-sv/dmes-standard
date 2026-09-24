// TSK-08-03 design §3.2 — 피벗 모델(시안 pvSpec/pvCols/pvBand/pvReorder 포팅, flatten↔pivot 왕복). 저장은 항상 평탄화 행(불변 3).
import { describe, expect, it } from "vitest";

import type { GridRow } from "../../../pages/dme/ruleEdit/decision-table/grid-model";
import {
  applyPivotEdit,
  buildPivot,
  flattenPivot,
  pvBand,
  pvCols,
  pvReorder,
  pvSpec,
} from "../../../pages/dme/ruleEdit/sections/pivot/pivot-model";
import type { ResolvedVar, VarMeta } from "../../../pages/dme/ruleEdit/types";

function rv(over: Partial<ResolvedVar> & Pick<ResolvedVar, "varId" | "varKind" | "seq">): ResolvedVar {
  return { dispType: null, varName: "X", exprVar: false, dataType: "STRING", dateString: false, typeSource: "COLUMN", ...over };
}

const THK = rv({ varId: 1, varKind: "COND", seq: 1, dispType: "2", varName: "COIL_THK", dataType: "NUMBER" });
const RESIN = rv({ varId: 2, varKind: "COND", seq: 2, dispType: "Equal", varName: "TOP_RESIN_CD" });
const SPD = rv({ varId: 3, varKind: "RESULT", seq: 1, dispType: "Value", varName: "BASE_SPD", dataType: "NUMBER" });
const AXIS: VarMeta[] = [
  { varId: 1, axis: "ROW" },
  { varId: 2, axis: "COL" },
  { varId: 3, axis: null },
];

const band = (lo: string, hi: string, op = "<= 변수 <") => ({ op, left: lo, right: hi });
function gr(rowId: number, seq: number, ax: ReturnType<typeof band>, col: string, val: string, note = ""): GridRow {
  return { rowId, seq, rowKind: "NORMAL", note, cells: { 1: ax, 2: { op: "EQ", left: col }, 3: { val } } };
}

// 구간 2 × 열 3(빈칸 1) — pvReorder 순서(구간 하한 → 상한 → 열 순서)로 이미 정렬돼 있다.
const ROWS: GridRow[] = [
  gr(1, 1, band("0", "0.5"), "2", "100"),
  gr(2, 2, band("0", "0.5"), "6", "90"),
  gr(3, 3, band("0", "0.5"), "F", "80"),
  gr(4, 4, band("0.5", "0.6", "< 변수 <"), "2", "70"),
  gr(5, 5, band("0.5", "0.6", "< 변수 <"), "6", "60"),
  { rowId: 9, seq: 0, rowKind: "DEFAULT", note: "", cells: { 3: { val: "10" } } },
];

describe("pvSpec — 피벗이 보이는 조건과 편집 조건", () => {
  const spec = (kind: "DECISION" | "DERIVE", vars: ResolvedVar[], meta: VarMeta[] = AXIS) => pvSpec(kind, vars, meta);

  it("DECISION ∧ 행 축 ≥1 ∧ 열 축 ≥1 ∧ 결과 열 1개이면 보이고, 표시 타입 조건까지 맞으면 편집한다", () => {
    const s = spec("DECISION", [THK, RESIN, SPD]);
    expect(s).not.toBeNull();
    expect(s!.rv.map((v) => v.varId)).toEqual([1]);
    expect(s!.cv.map((v) => v.varId)).toEqual([2]);
    expect(s!.res.varId).toBe(3);
    expect(s!.two).toBe(true);
    expect(s!.editable).toBe(true);
  });

  it("DERIVE 룰은 피벗이 없다", () => {
    expect(spec("DERIVE", [THK, RESIN, SPD])).toBeNull();
  });

  it("행 축이 없거나 열 축이 없으면 피벗이 없다", () => {
    expect(spec("DECISION", [THK, RESIN, SPD], [{ varId: 1, axis: "NONE" }, { varId: 2, axis: "COL" }])).toBeNull();
    expect(spec("DECISION", [THK, RESIN, SPD], [{ varId: 1, axis: "ROW" }, { varId: 2, axis: "NONE" }])).toBeNull();
    expect(spec("DECISION", [THK, RESIN, SPD], [])).toBeNull();
  });

  it("결과 열이 정확히 1개가 아니면 피벗이 없다(BASE_SPD_LKP 그룹 8열 모양)", () => {
    const res2 = rv({ varId: 4, varKind: "RESULT", seq: 2, dispType: "Value", varName: "BASE_SPD", resGrp: "BASE_SPD" } as never);
    expect(spec("DECISION", [THK, RESIN, SPD, res2])).toBeNull();
    expect(spec("DECISION", [THK, RESIN])).toBeNull();
  });

  it("행 축 표시 타입이 2 가 아니면 보이되 편집하지 않는다", () => {
    const s = spec("DECISION", [{ ...THK, dispType: "1" }, RESIN, SPD])!;
    expect(s.two).toBe(false);
    expect(s.editable).toBe(false);
  });

  it("행 축이 조건 열 2개이면 보이되 편집하지 않는다", () => {
    const wid = rv({ varId: 5, varKind: "COND", seq: 3, dispType: "2", varName: "COIL_WID", dataType: "NUMBER" });
    const s = spec("DECISION", [THK, RESIN, SPD, wid], [...AXIS, { varId: 5, axis: "ROW" }])!;
    expect(s.rv).toHaveLength(2);
    expect(s.two).toBe(false);
    expect(s.editable).toBe(false);
  });

  it("열 축이 Equal 이 아니거나 열 축이 2개이거나 결과가 Value 가 아니면 편집하지 않는다", () => {
    expect(spec("DECISION", [THK, { ...RESIN, dispType: "1" }, SPD])!.editable).toBe(false);
    const c2 = rv({ varId: 6, varKind: "COND", seq: 3, dispType: "Equal", varName: "COAT_SIDE" });
    expect(spec("DECISION", [THK, RESIN, SPD, c2], [...AXIS, { varId: 6, axis: "COL" }])!.editable).toBe(false);
    expect(spec("DECISION", [THK, RESIN, { ...SPD, dispType: "Expression" }])!.editable).toBe(false);
  });
});

describe("buildPivot·pvCols — 열 축 값 순서", () => {
  const spec = pvSpec("DECISION", [THK, RESIN, SPD], AXIS)!;

  it("열 축 값은 행 순서대로 처음 나온 값 순서다(기본 행은 피벗에 없다)", () => {
    expect(pvCols(spec, ROWS)).toEqual(["2", "6", "F"]);
    const pv = buildPivot(spec, ROWS);
    expect(pv.cols).toEqual(["2", "6", "F"]);
    expect(pv.bands.map((b) => b.first.rowId)).toEqual([1, 4]);
    expect(pv.bands[0].cells["F"].map((r) => r.rowId)).toEqual([3]);
    expect(pv.bands[1].cells["F"]).toBeUndefined();
    expect(pv.bands[1].lo).toBe("<");
    expect(pv.bands[1].hi).toBe("<");
  });

  it("앞 룰 결과가 열 축이면 그 룰 행 순서가 먼저이고 나머지는 처음 나온 순서로 뒤에 붙는다", () => {
    expect(pvCols(spec, ROWS, ["F", "6"])).toEqual(["F", "6", "2"]);
  });

  it("같은 구간·같은 열에 행이 둘이면 셀이 겹침(행 2개)으로 잡힌다", () => {
    const dup = [...ROWS, gr(7, 6, band("0", "0.5"), "2", "55")];
    expect(buildPivot(spec, dup).bands[0].cells["2"].map((r) => r.rowId)).toEqual([1, 7]);
  });
});

describe("pvBand·pvReorder", () => {
  const spec = pvSpec("DECISION", [THK, RESIN, SPD], AXIS)!;

  it("pvBand 는 같은 구간(행 축 요약이 같은) NORMAL 행 전부다", () => {
    expect(pvBand(spec, ROWS, 2).map((r) => r.rowId)).toEqual([1, 2, 3]);
    expect(pvBand(spec, ROWS, 5).map((r) => r.rowId)).toEqual([4, 5]);
    expect(pvBand(spec, ROWS, 99)).toEqual([]);
  });

  it("pvReorder 는 구간 하한 → 상한 → 열 순서로 seq 를 다시 매긴다", () => {
    const shuffled: GridRow[] = [
      gr(4, 1, band("0.5", "0.6"), "2", "70"),
      gr(3, 2, band("0", "0.5"), "F", "80"),
      gr(2, 3, band("0", "0.5"), "6", "90"),
      gr(1, 4, band("0", "0.5"), "2", "100"),
    ];
    const out = pvReorder(spec, shuffled, ["2", "6", "F"]);
    expect(out.map((r) => r.rowId)).toEqual([1, 2, 3, 4]);
    expect(out.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });

  it("빈 하한(무한대)은 맨 뒤로 가고, 기본 행은 끝에 남는다", () => {
    const rows: GridRow[] = [gr(1, 1, band("", "9"), "2", "1"), gr(2, 2, band("0", "1"), "2", "2"), ROWS[5]];
    const out = pvReorder(spec, rows);
    expect(out.map((r) => r.rowId)).toEqual([2, 1, 9]);
    expect(out[2].seq).toBe(0);
  });
});

describe("flatten↔pivot 왕복", () => {
  const spec = pvSpec("DECISION", [THK, RESIN, SPD], AXIS)!;

  it("pivot → flatten 은 원래 행과 같다(행 ID·셀·메모·기본 행 유지)", () => {
    const pv = buildPivot(spec, ROWS);
    const flat = flattenPivot(spec, pv, ROWS);
    expect(flat).toEqual(ROWS);
  });

  it("pivot → flatten → pivot 이 같은 피벗이다", () => {
    const pv = buildPivot(spec, ROWS);
    const again = buildPivot(spec, flattenPivot(spec, pv, ROWS));
    expect(again).toEqual(pv);
  });

  it("메모·다른 조건 열 셀은 피벗을 거쳐도 남는다", () => {
    const extra: GridRow[] = ROWS.map((r) => (r.rowId === 2 ? { ...r, note: "메모", cells: { ...r.cells, 7: { op: "EQ", left: "K" } } } : r));
    const flat = flattenPivot(spec, buildPivot(spec, extra), extra);
    expect(flat.find((r) => r.rowId === 2)).toEqual(extra.find((r) => r.rowId === 2));
  });
});

describe("applyPivotEdit — 셀 하나 = 행 하나, 구간 하나 = 열 수만큼의 행", () => {
  const spec = pvSpec("DECISION", [THK, RESIN, SPD], AXIS)!;

  it("기존 셀 값을 고치면 그 행 하나의 결과 셀만 바뀐다", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "cell", bandRowId: 1, col: "6", value: "95" }, 0)!;
    expect(r.rows.find((x) => x.rowId === 2)!.cells[3]).toEqual({ val: "95" });
    expect(r.rows.filter((x) => x.rowId !== 2)).toEqual(ROWS.filter((x) => x.rowId !== 2));
    expect(r.message).toContain("row_id 2");
  });

  it("빈칸에 값을 넣으면 행을 만든다(음수 임시 ID, 구간 셀 복사, 열 축 값 채움)", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "cell", bandRowId: 4, col: "F", value: "50" }, -3)!;
    const added = r.rows.find((x) => x.rowId === -4)!;
    expect(added.cells[1]).toEqual(band("0.5", "0.6", "< 변수 <"));
    expect(added.cells[2]).toEqual({ op: "EQ", left: "F" });
    expect(added.cells[3]).toEqual({ val: "50" });
    expect(r.lastTempId).toBe(-4);
    expect(r.rows.filter((x) => x.rowKind === "NORMAL")).toHaveLength(6);
  });

  it("값을 지우면 그 행을 지운다", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "cell", bandRowId: 1, col: "F", value: "  " }, 0)!;
    expect(r.rows.some((x) => x.rowId === 3)).toBe(false);
    expect(r.rows.filter((x) => x.rowKind === "NORMAL")).toHaveLength(4);
  });

  it("빈칸에 빈 값을 넣으면 아무것도 하지 않고, 겹침 셀은 편집하지 않는다", () => {
    expect(applyPivotEdit(spec, ROWS, { type: "cell", bandRowId: 4, col: "F", value: "" }, 0)).toBeNull();
    const dup = [...ROWS, gr(7, 6, band("0", "0.5"), "2", "55")];
    expect(applyPivotEdit(spec, dup, { type: "cell", bandRowId: 1, col: "2", value: "1" }, 0)).toBeNull();
  });

  it("구간 하한·상한을 고치면 그 구간의 행 전부의 행 축 셀이 바뀐다", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "band", bandRowId: 1, lo: "0.1", lop: "<", hi: "0.6", hop: "<=" }, 0)!;
    for (const id of [1, 2, 3]) expect(r.rows.find((x) => x.rowId === id)!.cells[1]).toEqual(band("0.1", "0.6", "< 변수 <="));
    expect(r.rows.find((x) => x.rowId === 4)!.cells[1]).toEqual(band("0.5", "0.6", "< 변수 <"));
  });

  it("구간 추가는 아래에 열 수만큼의 행을 만들고 하한은 앞 구간 상한, 값은 복사한다", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "addBand", bandRowId: 1 }, 0)!;
    const added = r.rows.filter((x) => x.rowId < 0);
    expect(added.map((x) => x.rowId)).toEqual([-1, -2, -3]);
    expect(added[0].cells[1]).toEqual({ op: "<= 변수 <", left: "0.5", right: "" }); // 앞 구간이 상한 미포함("<") 이라 새 구간은 이상("<=")으로 시작
    expect(added.map((x) => x.cells[3])).toEqual([{ val: "100" }, { val: "90" }, { val: "80" }]);
    expect(r.lastTempId).toBe(-3);
  });

  it("앞 구간이 상한을 포함하면 새 구간은 초과로 시작한다", () => {
    const rows: GridRow[] = [gr(1, 1, band("0", "1", "<= 변수 <="), "2", "5")];
    const r = applyPivotEdit(spec, rows, { type: "addBand", bandRowId: 1 }, 0)!;
    expect(r.rows.find((x) => x.rowId === -1)!.cells[1]).toEqual({ op: "< 변수 <", left: "1", right: "" });
  });

  it("구간 삭제는 그 구간 행 전부를 지운다", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "delBand", bandRowId: 1 }, 0)!;
    expect(r.rows.map((x) => x.rowId)).toEqual([4, 5, 9]);
  });

  it("편집 뒤 행은 pvReorder 순서(seq 1..n)로 놓이고 다시 펼쳐도 같다(왕복)", () => {
    const r = applyPivotEdit(spec, ROWS, { type: "cell", bandRowId: 4, col: "F", value: "50" }, 0)!;
    const normal = r.rows.filter((x) => x.rowKind === "NORMAL");
    expect(normal.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(normal.map((x) => x.rowId)).toEqual([1, 2, 3, 4, 5, -1]);
    expect(flattenPivot(spec, buildPivot(spec, r.rows), r.rows)).toEqual(r.rows);
  });

  it("편집이 불가능한 모양이면 편집을 받지 않는다", () => {
    const ro = pvSpec("DECISION", [{ ...THK, dispType: "1" }, RESIN, SPD], AXIS)!;
    expect(applyPivotEdit(ro, ROWS, { type: "cell", bandRowId: 1, col: "2", value: "1" }, 0)).toBeNull();
  });
});
