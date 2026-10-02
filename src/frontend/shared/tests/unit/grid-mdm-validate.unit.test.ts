/** @vitest-environment happy-dom */
/**
 * AgDataGrid 칸 검증 표시(spec §4 mdmValidate·fieldErrors, §5 C2·C9).
 *  - 두 prop 이 없으면 열 정의가 예전과 같다(키 목록 불변).
 *  - fieldErrors(서버 오류)는 공급자 밖에서도 칸에 cell-mdm-invalid 와 툴팁 문구를 단다. rowKey → rowIndex 순으로 행을 찾는다.
 *  - mdmValidate 는 공급자 안 + 편집 가능 + MDM 연결 칸만, 값이 바뀐 칸을 검사한다. 같은 칸에 서버 오류가 있으면 서버 문구.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import { AgDataGrid, buildColumnDefs, indexFieldErrors, pickCellIssue, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GRID_TEMP_ID_FIELD } from "../../src/components/grid/GridPanel";
import { MdmMetaProvider, resetMdmMetaStore } from "../../src/mdm-meta";
import { column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const OPTS = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
const LEAF_KEYS = [
  "field", "headerName", "headerComponent", "headerComponentParams", "hide", "pinned", "width", "flex", "minWidth",
  "sortable", "resizable", "editable", "cellEditor", "cellEditorParams", "cellDataType", "refData", "cellStyle",
  "cellClass", "cellClassRules", "headerClass", "headerTooltip", "headerStyle", "rowDrag", "cellRenderer", "valueFormatter",
];

type RuleFn = (p: unknown) => boolean;
type TipFn = (p: unknown) => string;
const params = (id: string, value: unknown, data: Record<string, unknown> = {}) => ({ node: { id }, value, data });

describe("buildColumnDefs — 칸 검증 표시", () => {
  it("cellIssue 가 없으면 열 정의 키가 예전과 같다", () => {
    const defs = buildColumnDefs([{ key: "a", header: "A", cellClassRules: { x: () => true } }], OPTS) as ColDef[];
    expect(Object.keys(defs[0])).toEqual(LEAF_KEYS);
  });

  it("cellIssue 가 있으면 cell-mdm-invalid 규칙을 화면 규칙에 더하고 툴팁을 오류 문구로", () => {
    const issue = vi.fn((rowId: string, colKey: string, value: unknown) =>
      rowId === "1" && colKey === "a" && value === "bad" ? "A 오류" : null
    );
    const defs = buildColumnDefs(
      [{ key: "a", header: "A", cellClassRules: { mine: (row) => row.flag === true } }, { key: "b", tooltip: false }],
      { ...OPTS, cellIssue: issue }
    ) as ColDef[];
    const rules = defs[0].cellClassRules as Record<string, RuleFn>;
    expect(Object.keys(rules)).toEqual(["mine", "cell-mdm-invalid"]);
    expect(rules.mine(params("1", "x", { flag: true }))).toBe(true);
    expect(rules["cell-mdm-invalid"](params("1", "bad"))).toBe(true);
    expect(rules["cell-mdm-invalid"](params("1", "good"))).toBe(false);
    expect(rules["cell-mdm-invalid"](params("2", "bad"))).toBe(false);
    const tip = defs[0].tooltipValueGetter as TipFn;
    expect(tip(params("1", "bad"))).toBe("A 오류");
    expect(tip(params("1", "good"))).toBe("good");
    expect(tip(params("1", null))).toBe("");
    // tooltip:false 칸은 오류일 때만 문구, 아니면 빈 툴팁
    const tipB = defs[1].tooltipValueGetter as TipFn;
    expect(tipB(params("1", "v"))).toBe("");
    issue.mockImplementation(() => "B 오류");
    expect(tipB(params("1", "v"))).toBe("B 오류");
  });

  it("열 그룹 안의 잎 열에도 단다", () => {
    const defs = buildColumnDefs([{ key: "g", header: "G", children: [{ key: "a" }] }], {
      ...OPTS,
      cellIssue: () => "x",
    });
    const leaf = (defs[0] as ColGroupDef).children[0] as ColDef;
    expect(Object.keys(leaf.cellClassRules as object)).toEqual(["cell-mdm-invalid"]);
  });
});

describe("indexFieldErrors", () => {
  const columns: GridColumn[] = [
    { key: "noticeId" },
    { key: "title" },
    { key: "g", children: [{ key: "CATEGORY" }] },
  ];
  const data = [
    { noticeId: "N1", title: "a" },
    { noticeId: "N2", title: "b", rowKey: "RK2" },
    { [GRID_TEMP_ID_FIELD]: "tmp-1", noticeId: "", title: "" },
  ];

  it("rowKey 는 rowKey 칸·행 rowKey·임시 ID 로, 없으면 rowIndex 로 행을 찾는다", () => {
    const idx = indexFieldErrors(
      [
        { rowKey: "N1", field: "title", message: "m1" },
        { rowKey: "RK2", field: "title", message: "m2" },
        { rowKey: "tmp-1", field: "title", message: "m3" },
        { rowIndex: 1, field: "noticeId", message: "m4" },
      ],
      data,
      "noticeId",
      columns
    );
    expect(idx.get("N1")?.get("title")).toBe("m1");
    expect(idx.get("N2")?.get("title")).toBe("m2");
    expect(idx.get("tmp-1")?.get("title")).toBe("m3");
    expect(idx.get("N2")?.get("noticeId")).toBe("m4");
  });

  it("field 는 열 key 와 같거나 물리명이 같으면 맞는다(그룹 안 잎까지), 없는 열·행은 버린다", () => {
    const idx = indexFieldErrors(
      [
        { rowIndex: 0, field: "TITLE", message: "phys" },
        { rowIndex: 0, field: "category", message: "cat" },
        { rowIndex: 0, field: "NOPE", message: "x" },
        { rowIndex: 9, field: "title", message: "x" },
        { rowKey: "ZZ", field: "title", message: "x" },
      ],
      data,
      "noticeId",
      columns
    );
    expect([...idx.keys()]).toEqual(["N1"]);
    expect(Object.fromEntries(idx.get("N1")!)).toEqual({ title: "phys", CATEGORY: "cat" });
  });

  it("같은 칸 오류가 여럿이면 첫 문구", () => {
    const idx = indexFieldErrors(
      [
        { rowIndex: 0, field: "title", message: "첫째" },
        { rowIndex: 0, field: "title", message: "둘째" },
      ],
      data,
      "noticeId",
      columns
    );
    expect(idx.get("N1")?.get("title")).toBe("첫째");
  });
});

describe("AgDataGrid 렌더 — 칸 검증 표시", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    resetMdmMetaStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container.remove();
    vi.unstubAllGlobals();
  });

  const cell = (rowId: string, colId: string) =>
    container.querySelector(`.ag-center-cols-container [row-id="${rowId}"] [col-id="${colId}"]`) as HTMLElement | null;
  const invalid = () =>
    [...container.querySelectorAll(".ag-center-cols-container .cell-mdm-invalid")].map(
      (el) => `${el.closest("[row-id]")?.getAttribute("row-id")}:${el.getAttribute("col-id")}`
    );

  async function show(el: ReactNode) {
    await act(async () => root!.render(el));
    await act(async () => {
      await settle(80);
    });
  }

  async function editText(rowId: string, colId: string, text: string) {
    await act(async () => {
      cell(rowId, colId)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await act(async () => {
      await settle(30);
    });
    const input = container.querySelector(".ag-cell-inline-editing input") as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await act(async () => {
      input!.value = text;
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await settle(50);
    });
  }

  const data = [
    { id: "1", title: "가", memo: "m" },
    { id: "2", title: "나", memo: "m" },
  ];
  const columns: GridColumn[] = [
    { key: "title", header: "제목", editable: true },
    { key: "memo", header: "메모", editable: true },
  ];

  it("두 prop 이 없으면 아무 칸에도 표시가 없다", async () => {
    await show(createElement(AgDataGrid, { columns, data, rowKey: "id", height: "auto" }));
    expect(cell("1", "title")).not.toBeNull();
    expect(invalid()).toEqual([]);
  });

  it("fieldErrors 는 공급자 밖에서도 칸에 표시하고, 바뀌면 다시 그린다", async () => {
    const f = fakeMetaFetch({});
    vi.stubGlobal("fetch", f.fn);
    const base = { columns, data, rowKey: "id", height: "auto" };
    await show(createElement(AgDataGrid, { ...base, fieldErrors: [{ rowKey: "2", field: "TITLE", message: "서버: 제목 오류" }] }));
    expect(invalid()).toEqual(["2:title"]);
    await show(createElement(AgDataGrid, { ...base, fieldErrors: [{ rowIndex: 0, field: "memo", message: "서버: 메모" }] }));
    expect(invalid()).toEqual(["1:memo"]);
    await show(createElement(AgDataGrid, { ...base, fieldErrors: [] }));
    expect(invalid()).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });

  it("서버 오류 칸을 사용자가 고치면 서버 표시를 내리고, 새 fieldErrors 를 받으면 다시 보인다", async () => {
    const f = fakeMetaFetch({});
    vi.stubGlobal("fetch", f.fn);
    const base = { columns, data, rowKey: "id", height: "auto" };
    const errs = [{ rowKey: "1", field: "title", message: "서버 오류" }];
    await show(createElement(AgDataGrid, { ...base, fieldErrors: errs }));
    expect(invalid()).toEqual(["1:title"]);
    await editText("1", "title", "고침");
    expect(invalid()).toEqual([]);
    // 같은 배열을 다시 넘기면(다시 그리기) 그대로 내린 상태
    await show(createElement(AgDataGrid, { ...base, fieldErrors: errs }));
    expect(invalid()).toEqual([]);
    // 새 저장 결과(새 배열)면 다시 보인다
    await show(createElement(AgDataGrid, { ...base, fieldErrors: [...errs] }));
    expect(invalid()).toEqual(["1:title"]);
  });

  it("mdmValidate — 편집한 MDM 칸을 검사해 표시하고, 고치면 지운다", async () => {
    const f = fakeMetaFetch({
      columns: { TITLE: column("TITLE", { labelMid: "공지제목", length: 3, required: true }) },
    });
    vi.stubGlobal("fetch", f.fn);
    const onCellValueChanged = vi.fn();
    const grid = (extra: Record<string, unknown> = {}) =>
      createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(AgDataGrid, {
          columns,
          data,
          rowKey: "id",
          height: "auto",
          mdmValidate: true,
          onCellValueChanged,
          ...extra,
        })
      );
    await show(grid());
    expect(f.calls[0].body).toEqual({ names: ["TITLE", "MEMO"] });

    await editText("1", "title", "가나다라");
    expect(onCellValueChanged).toHaveBeenCalled();
    expect(invalid()).toEqual(["1:title"]);

    // MDM 에 없는 칸(memo)은 검사하지 않는다
    await editText("1", "memo", "아주 긴 메모 값");
    expect(invalid()).toEqual(["1:title"]);

    await editText("1", "title", "가나");
    expect(invalid()).toEqual([]);
  });

  it("mdmValidate 는 공급자 밖이면 아무것도 하지 않는다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE: column("TITLE", { length: 1 }) } });
    vi.stubGlobal("fetch", f.fn);
    await show(createElement(AgDataGrid, { columns, data, rowKey: "id", height: "auto", mdmValidate: true }));
    await editText("1", "title", "가나다");
    expect(invalid()).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });

  it("편집 불가 칸은 mdmValidate 대상이 아니다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE: column("TITLE", { length: 1 }) } });
    vi.stubGlobal("fetch", f.fn);
    await show(
      createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(AgDataGrid, {
          columns: [{ key: "title", header: "제목" }],
          data: [{ id: "1", title: "가나다" }],
          rowKey: "id",
          height: "auto",
          mdmValidate: true,
        })
      )
    );
    expect(invalid()).toEqual([]);
  });
});

describe("pickCellIssue — 칸 하나의 표시 문구", () => {
  it("서버 오류가 있으면 서버 문구가 이긴다", () => {
    expect(pickCellIssue("서버", false, { value: "x", message: "화면" }, "x")).toBe("서버");
  });
  it("서버 오류를 낸 뒤 그 칸을 고쳤으면(dismissed) 화면 검사 문구", () => {
    expect(pickCellIssue("서버", true, { value: "x", message: "화면" }, "x")).toBe("화면");
    expect(pickCellIssue("서버", true, undefined, "x")).toBeNull();
  });
  it("화면 검사 문구는 검사한 값이 지금 값과 같을 때만(값이 바뀌었으면 낡은 판정)", () => {
    expect(pickCellIssue(undefined, false, { value: "x", message: "화면" }, "y")).toBeNull();
    expect(pickCellIssue(undefined, false, { value: 12, message: "화면" }, "12")).toBe("화면");
    expect(pickCellIssue(undefined, false, { value: null, message: "화면" }, undefined)).toBe("화면");
  });
});
