/** @vitest-environment happy-dom */
/**
 * AgDataGrid × MDM 화면 메타(spec B1·B2·B6·B7, §4 기존 shared 변경).
 *  - 공급자 밖: 열 정의 모양과 머리글이 예전과 같고 아무것도 부르지 않는다.
 *  - 공급자 안: 비운 header 는 MDM 캡션, 머리글 툴팁은 사용자 툴팁 컴포넌트(MdmMetaCard).
 *  - 화면이 headerTooltip·headerComponent 를 주면 그대로 둔다.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import {
  AgDataGrid,
  MdmGridTooltip,
  buildColumnDefs,
  useResolvedGridColumns,
  type GridColumn,
} from "../../src/components/grid/AgDataGrid";
import { MdmMetaProvider, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const OPTS = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
// 2026-10-03 변경 전 leafColDef·그룹 정의의 키 목록 — 공급자 밖(MDM 없음)에서는 새 키가 생기면 안 된다.
const LEAF_KEYS = [
  "field", "headerName", "headerComponent", "headerComponentParams", "hide", "pinned", "width", "flex", "minWidth",
  "sortable", "resizable", "editable", "cellEditor", "cellEditorParams", "cellDataType", "refData", "cellStyle",
  "cellClass", "cellClassRules", "headerClass", "headerTooltip", "headerStyle", "rowDrag", "cellRenderer", "valueFormatter",
];
const GROUP_KEYS = [
  "groupId", "headerName", "headerGroupComponent", "headerGroupComponentParams", "headerTooltip", "headerClass",
  "headerStyle", "children",
];

const info = (c: MdmColumnInfo["column"], d: MdmColumnInfo["domain"] = null): MdmColumnInfo => ({
  column: c,
  domain: d,
  loading: false,
});

describe("buildColumnDefs — MDM 없음(공급자 밖)", () => {
  it("열 정의 키가 예전과 같다", () => {
    const defs = buildColumnDefs(
      [{ key: "a", header: "A" }, { key: "g", header: "G", children: [{ key: "b", header: "B" }] }],
      OPTS
    );
    expect(Object.keys(defs[0])).toEqual(LEAF_KEYS);
    expect(Object.keys(defs[1])).toEqual(GROUP_KEYS);
    expect((defs[0] as ColDef).headerName).toBe("A");
  });

  it("header 를 비우면 열 key 를 머리글로 쓴다(ag-grid 자동 이름 'Code Nm' 이 되지 않게)", () => {
    const defs = buildColumnDefs([{ key: "codeNm" }, { key: "g", children: [{ key: "b" }] }], OPTS);
    expect((defs[0] as ColDef).headerName).toBe("codeNm");
    expect((defs[1] as ColGroupDef).headerName).toBe("g");
  });

  it('header: "" 는 빈 머리글 그대로', () => {
    const defs = buildColumnDefs([{ key: "btn", header: "" }], OPTS);
    expect((defs[0] as ColDef).headerName).toBe("");
  });
});

describe("buildColumnDefs — MDM 있음", () => {
  const mdm = (priority: "explicit" | "mdm" = "explicit") => ({
    priority,
    infoByKey: new Map<string, MdmColumnInfo>([
      ["title", info(TITLE, TEXT_DOMAIN)],
      ["category", info(null)],
    ]),
  });

  it("비운 header 는 그리드 캡션(labelShort), 적은 header 는 그대로(explicit)", () => {
    const defs = buildColumnDefs(
      [{ key: "title" }, { key: "category" }],
      { ...OPTS, mdm: mdm() }
    ) as ColDef[];
    expect(defs[0].headerName).toBe("제목");
    expect(defs[1].headerName).toBe("category");
    const explicit = buildColumnDefs([{ key: "title", header: "공지 제목(화면)" }], { ...OPTS, mdm: mdm() }) as ColDef[];
    expect(explicit[0].headerName).toBe("공지 제목(화면)");
  });

  it('captionPriority="mdm" 이면 MDM 캡션이 이긴다', () => {
    const defs = buildColumnDefs([{ key: "title", header: "화면 제목" }], { ...OPTS, mdm: mdm("mdm") }) as ColDef[];
    expect(defs[0].headerName).toBe("제목");
  });

  it("메타가 있으면 머리글 툴팁을 사용자 툴팁 컴포넌트로 단다", () => {
    const defs = buildColumnDefs([{ key: "title" }, { key: "category", header: "분류" }], { ...OPTS, mdm: mdm() }) as ColDef[];
    expect(defs[0].headerTooltip).toBe("제목");
    expect(defs[0].tooltipComponent).toBe(MdmGridTooltip);
    expect(defs[0].tooltipComponentParams).toEqual({ mdmColumn: TITLE, mdmDomain: TEXT_DOMAIN });
    expect(defs[1].tooltipComponent).toBeUndefined();
    expect(Object.keys(defs[1])).toEqual(LEAF_KEYS);
  });

  it("화면이 headerTooltip·headerComponent 를 주면 그대로 둔다", () => {
    const Header = () => null;
    const defs = buildColumnDefs(
      [
        { key: "title", headerTooltip: "화면 툴팁" },
        { key: "title2", meta: "TITLE", headerComponent: Header },
      ],
      {
        ...OPTS,
        mdm: { priority: "explicit", infoByKey: new Map([["title", info(TITLE)], ["title2", info(TITLE)]]) },
      }
    ) as ColDef[];
    expect(defs[0].headerTooltip).toBe("화면 툴팁");
    expect(defs[0].tooltipComponent).toBeUndefined();
    expect(defs[1].headerComponent).toBe(Header);
    expect(defs[1].tooltipComponent).toBeUndefined();
    expect(defs[1].headerName).toBe("제목");
  });

  it('머리글이 "" 로 비면 툴팁 문자열은 물리명으로 채운다(ag-grid 는 빈 문자열 툴팁을 띄우지 않는다)', () => {
    const defs = buildColumnDefs([{ key: "title", header: "" }], { ...OPTS, mdm: mdm() }) as ColDef[];
    expect(defs[0].headerName).toBe("");
    expect(defs[0].headerTooltip).toBe("TITLE");
  });
});

describe("MdmGridTooltip", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
  });
  function render(el: ReactNode) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(el));
  }

  it("머리글이면 MdmMetaCard 를 그린다", () => {
    render(createElement(MdmGridTooltip, { location: "header", value: "제목", mdmColumn: TITLE, mdmDomain: TEXT_DOMAIN } as never));
    expect(host.querySelector('[data-mdm-section="title"]')?.textContent).toContain("공지 제목");
  });

  it("셀이면 기본 툴팁처럼 값 글자만 그린다", () => {
    render(
      createElement(MdmGridTooltip, { location: "cell", value: "원래 값", valueFormatted: null, mdmColumn: TITLE } as never)
    );
    expect(host.textContent).toBe("원래 값");
    expect(host.querySelector(".ag-tooltip")).not.toBeNull();
    expect(host.querySelector("[data-mdm-section]")).toBeNull();
  });
});

describe("AgDataGrid 렌더", () => {
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

  const headerTexts = () =>
    [...container.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent);

  const columns: GridColumn[] = [
    { key: "title" },
    { key: "category", header: "분류(화면)" },
  ];

  async function show(el: ReactNode) {
    await act(async () => root!.render(el));
    await act(async () => {
      await settle(80);
    });
  }

  it("공급자 밖에서는 부르지 않고 적은 머리글·열 key 를 그린다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    await show(createElement(AgDataGrid, { columns, rowKey: "title", data: [] }));
    expect(headerTexts()).toEqual(["title", "분류(화면)"]);
    expect(f.calls).toHaveLength(0);
  });

  it("공급자 안에서는 비운 머리글이 MDM 캡션이 된다", async () => {
    const f = fakeMetaFetch({ columns: { TITLE, CATEGORY: column("CATEGORY", { labelShort: "분류" }) } });
    vi.stubGlobal("fetch", f.fn);
    await show(
      createElement(MdmMetaProvider, { module: "mls" }, createElement(AgDataGrid, { columns, rowKey: "title", data: [] }))
    );
    await act(async () => {
      await settle(80);
    });
    expect(f.calls[0].body).toEqual({ names: ["TITLE", "CATEGORY"] });
    expect(headerTexts()).toEqual(["제목", "분류(화면)"]);
  });
});

describe("useResolvedGridColumns", () => {
  it("엑셀 내보내기 등이 쓸 수 있게 header 를 해석한 캡션으로 채운다(그룹 안까지)", async () => {
    resetMdmMetaStore();
    const f = fakeMetaFetch({ columns: { TITLE } });
    vi.stubGlobal("fetch", f.fn);
    let out: GridColumn[] = [];
    function P() {
      out = useResolvedGridColumns([{ key: "g", header: "묶음", children: [{ key: "title" }, { key: "etc" }] }]);
      return null;
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(MdmMetaProvider, { module: "mls" }, createElement(P))));
    await act(async () => {
      await settle(80);
    });
    expect(out[0].header).toBe("묶음");
    expect(out[0].children?.map((c) => c.header)).toEqual(["제목", "etc"]);
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
