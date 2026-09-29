import { describe, expect, it } from "vitest";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import {
  buildColumnDefs,
  displayedRowKeys,
  hasEditableColumn,
  type GridColumn,
} from "../../src/components/grid/AgDataGrid";
import { GRID_TEMP_ID_FIELD } from "../../src/components/grid/GridPanel";

// TSK-08-02 D8 — AgDataGrid 열 그룹(children → ColGroupDef)·머리 툴팁·행 드래그 prop.
const BASE = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };

function isGroup(def: ColDef | ColGroupDef): def is ColGroupDef {
  return "children" in def;
}

describe("buildColumnDefs 열 그룹", () => {
  const leafRule = (row: Record<string, unknown>) => row.flag === true;
  const columns: GridColumn[] = [
    { key: "row", header: "행", width: 60 },
    {
      key: "cond",
      header: "조건",
      children: [
        {
          key: "v1",
          header: "COIL_THK",
          headerTooltip: "코일 두께",
          children: [
            { key: "c1_op", header: "OP", width: 90, editable: true, cellEditor: "select", cellEditorValues: ["NA", "EQ"] },
            { key: "c1_left", header: "하한", width: 80, editable: (row) => row.locked !== true, cellClassRules: { hit: leafRule } },
          ],
        },
      ],
    },
  ];

  it("children 이 있으면 ColGroupDef 로 바꾸고 잎만 ColDef 다(3줄 머리)", () => {
    const defs = buildColumnDefs(columns, BASE);
    expect(defs).toHaveLength(2);
    expect(isGroup(defs[0])).toBe(false);
    const cond = defs[1] as ColGroupDef;
    expect(isGroup(cond)).toBe(true);
    expect(cond.headerName).toBe("조건");
    expect(cond.groupId).toBe("cond");
    const v1 = cond.children[0] as ColGroupDef;
    expect(isGroup(v1)).toBe(true);
    expect(v1.headerName).toBe("COIL_THK");
    expect(v1.groupId).toBe("v1");
    expect(v1.headerTooltip).toBe("코일 두께");
    const leaves = v1.children as ColDef[];
    expect(leaves.map((l) => l.field)).toEqual(["c1_op", "c1_left"]);
    expect(leaves.every((l) => !isGroup(l))).toBe(true);
  });

  it("headerStyle 은 그룹·잎 머리에 그대로 넘긴다", () => {
    const style = { background: "var(--color-success-soft)" };
    const defs = buildColumnDefs(
      [{ key: "g", header: "조건", headerStyle: style, children: [{ key: "a", header: "A", headerStyle: style }] }],
      BASE,
    );
    const g = defs[0] as ColGroupDef;
    expect(g.headerStyle).toEqual(style);
    expect((g.children[0] as ColDef).headerStyle).toEqual(style);
  });

  it("잎의 기존 속성(편집·편집기·폭·클래스 규칙)은 그룹 안에서도 그대로다", () => {
    const flat = buildColumnDefs(
      [
        { key: "c1_op", header: "OP", width: 90, editable: true, cellEditor: "select", cellEditorValues: ["NA", "EQ"] },
        { key: "c1_left", header: "하한", width: 80, editable: (row) => row.locked !== true, cellClassRules: { hit: leafRule } },
      ],
      BASE,
    ) as ColDef[];
    const grouped = ((buildColumnDefs(columns, BASE)[1] as ColGroupDef).children[0] as ColGroupDef).children as ColDef[];
    for (let i = 0; i < flat.length; i++) {
      expect(grouped[i].field).toBe(flat[i].field);
      expect(grouped[i].headerName).toBe(flat[i].headerName);
      expect(grouped[i].width).toBe(flat[i].width);
      expect(typeof grouped[i].editable).toBe(typeof flat[i].editable);
      expect(grouped[i].cellEditor).toBe(flat[i].cellEditor);
      expect(grouped[i].sortable).toBe(flat[i].sortable);
    }
    const rules = grouped[1].cellClassRules as Record<string, (p: { data?: unknown }) => boolean>;
    expect(rules.hit({ data: { flag: true } })).toBe(true);
    expect(rules.hit({ data: { flag: false } })).toBe(false);
    const editable = grouped[1].editable as (p: { data?: unknown }) => boolean;
    expect(editable({ data: { locked: true } })).toBe(false);
  });

  it("잎의 headerTooltip 도 ColDef 로 넘긴다", () => {
    const defs = buildColumnDefs([{ key: "a", header: "A", headerTooltip: "설명" }], BASE) as ColDef[];
    expect(defs[0].headerTooltip).toBe("설명");
  });
});

describe("buildColumnDefs 행 드래그", () => {
  const columns: GridColumn[] = [
    { key: "row", header: "행" },
    { key: "note", header: "설명" },
  ];

  it("드래그 prop 이 없으면 기존 동작 그대로다(정렬 켜짐, rowDrag 없음)", () => {
    const defs = buildColumnDefs(columns, BASE) as ColDef[];
    expect(defs.map((d) => d.sortable)).toEqual([true, true]);
    expect(defs.map((d) => d.rowDrag)).toEqual([undefined, undefined]);
  });

  it("rowDragField 가 있으면 그 열에 rowDrag 를 켜고 모든 열의 정렬을 끈다", () => {
    const defs = buildColumnDefs(columns, { ...BASE, rowDragField: "row" }) as ColDef[];
    expect(defs[0].rowDrag).toBe(true);
    expect(defs[1].rowDrag).toBeUndefined();
    expect(defs.map((d) => d.sortable)).toEqual([false, false]);
  });

  it("isRowDraggable 이 있으면 행마다 드래그 여부를 판정한다", () => {
    const defs = buildColumnDefs(columns, {
      ...BASE,
      rowDragField: "row",
      isRowDraggable: (row) => row.kind === "NORMAL",
    }) as ColDef[];
    const rowDrag = defs[0].rowDrag as (p: { data?: unknown }) => boolean;
    expect(typeof rowDrag).toBe("function");
    expect(rowDrag({ data: { kind: "NORMAL" } })).toBe(true);
    expect(rowDrag({ data: { kind: "DEFAULT" } })).toBe(false);
  });

  it("그룹 안의 잎도 드래그 열이 될 수 있고 정렬이 꺼진다", () => {
    const defs = buildColumnDefs(
      [{ key: "g", header: "G", children: [{ key: "row", header: "행" }, { key: "x", header: "X" }] }],
      { ...BASE, rowDragField: "row" },
    );
    const leaves = (defs[0] as ColGroupDef).children as ColDef[];
    expect(leaves[0].rowDrag).toBe(true);
    expect(leaves.map((l) => l.sortable)).toEqual([false, false]);
  });
});

describe("displayedRowKeys", () => {
  it("화면에 보이는 순서대로 rowKey 값을 모은다", () => {
    const shown = [{ rowId: 3 }, { rowId: -1 }, { rowId: 1 }];
    const api = {
      getDisplayedRowCount: () => shown.length,
      getDisplayedRowAtIndex: (i: number) => ({ data: shown[i] }),
    };
    expect(displayedRowKeys(api, "rowId")).toEqual([3, -1, 1]);
  });

  it("임시 ID 칸이 있으면 그것을 키로 쓴다(다른 그리드 API 와 같은 규칙)", () => {
    const api = {
      getDisplayedRowCount: () => 2,
      getDisplayedRowAtIndex: (i: number) => ({ data: i === 0 ? { rowId: 1 } : { rowId: 0, [GRID_TEMP_ID_FIELD]: "tmp-1" } }),
    };
    expect(displayedRowKeys(api, "rowId")).toEqual([1, "tmp-1"]);
  });
});

describe("hasEditableColumn", () => {
  it("열 그룹 안의 편집 가능 잎도 찾는다", () => {
    expect(hasEditableColumn([{ key: "a", header: "A" }])).toBe(false);
    expect(
      hasEditableColumn([
        { key: "g", header: "G", children: [{ key: "v", header: "V", children: [{ key: "x", header: "X", editable: true }] }] },
      ]),
    ).toBe(true);
  });
});
