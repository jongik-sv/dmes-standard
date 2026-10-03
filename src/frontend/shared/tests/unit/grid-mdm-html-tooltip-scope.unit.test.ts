/** @vitest-environment happy-dom */
/**
 * HTML 설명 열이 있는 그리드(tooltipInteraction 켬)에서도 상호작용은 MDM HTML 머리글 카드 상자에만 둔다(2026-10-03 조정 결정).
 * ag-grid 는 tooltipInteraction 을 그리드 단위로 켜 모든 툴팁(셀 기본 툴팁·검증 오류 툴팁·MDM 셀 툴팁·글자 MDM 머리글 카드)에
 * 마우스가 들어가게 한다. 그 툴팁들은 커서 18px 아래에 떠 다음 행을 덮으므로, 상자가 마우스를 받지 않게(pointer-events:none) 하고
 * 마우스를 누르면 닫는 예전 동작을 유지한다. 그 밖의 그리드는 상자 DOM 이 예전 그대로다.
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgDataGrid,
  MdmGridInteractiveContext,
  MdmGridTooltip,
  buildColumnDefs,
  withPassThroughTooltips,
  type GridColumn,
} from "../../src/components/grid/AgDataGrid";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import { MdmMetaProvider, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelShort: "본문",
  description: "굵은 설명",
  descriptionHtml: "<p><b>굵은</b> 설명</p>",
});

describe("MdmGridTooltip — 상호작용 그리드 안의 상자", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
  });
  function render(el: ReactNode, interactiveGrid: boolean) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        interactiveGrid
          ? createElement(MdmGridInteractiveContext.Provider, { value: true }, el)
          : el
      )
    );
  }
  const box = () => host.querySelector<HTMLElement>(".ag-tooltip")!;
  const mousedown = () =>
    act(() => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  const tip = (props: Record<string, unknown>) => createElement(MdmGridTooltip, props as never);

  it("셀 툴팁·글자 MDM 머리글 카드 상자는 pointer-events:none, HTML 머리글 카드만 auto", () => {
    render(tip({ location: "cell", value: "값" }), true);
    expect(box().style.pointerEvents).toBe("none");
    act(() =>
      root!.render(
        createElement(
          MdmGridInteractiveContext.Provider,
          { value: true },
          tip({ location: "cell", value: "값", mdmColumn: BODY })
        )
      )
    );
    expect(box().style.pointerEvents).toBe("none");
    act(() =>
      root!.render(
        createElement(
          MdmGridInteractiveContext.Provider,
          { value: true },
          tip({ location: "header", value: "제목", mdmColumn: TITLE })
        )
      )
    );
    expect(box().style.pointerEvents).toBe("none");
    act(() =>
      root!.render(
        createElement(
          MdmGridInteractiveContext.Provider,
          { value: true },
          tip({ location: "header", value: "본문", mdmColumn: BODY })
        )
      )
    );
    expect(box().style.pointerEvents).toBe("auto");
  });

  it("HTML 카드가 아닌 툴팁은 마우스를 누르면 닫힌다(ag-grid 상호작용 모드가 끈 예전 동작) — HTML 카드는 누름으로 닫지 않는다", () => {
    const hide = vi.fn();
    render(tip({ location: "cell", value: "값", hideTooltipCallback: hide }), true);
    mousedown();
    expect(hide).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    host.remove();
    const htmlHide = vi.fn();
    render(
      tip({ location: "header", value: "본문", mdmColumn: BODY, hideTooltipCallback: htmlHide }),
      true
    );
    mousedown();
    expect(htmlHide).not.toHaveBeenCalled();
  });

  it("상호작용 그리드 밖에서는 상자 DOM·동작이 예전 그대로(style 문자열 동일, 누름을 듣지 않음)", () => {
    const hide = vi.fn();
    render(tip({ location: "cell", value: "값", hideTooltipCallback: hide }), false);
    expect(box().getAttribute("style")).toBe("width: max-content; max-width: 380px;");
    mousedown();
    expect(hide).not.toHaveBeenCalled();
  });
});

describe("withPassThroughTooltips — 열 정의", () => {
  const OPTS = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
  const info = (c: MdmColumnInfo["column"]): MdmColumnInfo => ({
    column: c,
    domain: null,
    loading: false,
  });
  const cols: GridColumn[] = [
    { key: "noticeBody" },
    {
      key: "grp",
      header: "묶음",
      headerTooltip: "묶음 설명",
      children: [{ key: "etc", header: "기타" }],
    },
  ];

  it("HTML 카드 열이 있으면 툴팁 컴포넌트가 없는 잎 열과 headerTooltip 을 가진 열 그룹에 MdmGridTooltip 을 단다", () => {
    const defs = withPassThroughTooltips(
      buildColumnDefs(cols, {
        ...OPTS,
        mdm: { priority: "explicit", infoByKey: new Map([["noticeBody", info(BODY)]]) },
      })
    );
    const group = defs[1] as ColGroupDef;
    expect(group.tooltipComponent).toBe(MdmGridTooltip);
    expect((group.children[0] as ColDef).tooltipComponent).toBe(MdmGridTooltip);
    expect((defs[0] as ColDef).tooltipComponentParams.mdmColumn).toBe(BODY); // MDM 열은 그대로
  });

  it("HTML 카드 열이 없으면 받은 배열을 그대로 돌려준다", () => {
    const built = buildColumnDefs(cols, {
      ...OPTS,
      mdm: { priority: "explicit", infoByKey: new Map([["noticeBody", info(TITLE)]]) },
    });
    expect(withPassThroughTooltips(built)).toBe(built);
  });
});

describe("AgDataGrid — HTML 열이 있는 그리드의 셀·머리글 툴팁 상자", () => {
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
    document.querySelectorAll(".ag-tooltip-custom, .ag-tooltip").forEach((el) => el.remove());
    vi.unstubAllGlobals();
  });

  const columns: GridColumn[] = [
    { key: "title" },
    { key: "noticeBody" },
    { key: "etc", header: "기타", meta: false },
  ];
  const data = [{ title: "T1", noticeBody: "B1", etc: "E1" }];

  async function show(extra: Record<string, unknown> = {}) {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, NOTICE_BODY: BODY } }).fn);
    await act(async () =>
      root!.render(
        createElement(
          MdmMetaProvider,
          { module: "mls" },
          createElement(AgDataGrid, { columns, data, rowKey: "title", height: "auto", ...extra })
        )
      )
    );
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await settle(80);
      });
    }
  }

  /** 칸(셀·머리글)에 마우스를 올리고 ag-grid 기본 표시 지연(2000ms)을 넘겨 기다린 뒤, 글자가 text 인 툴팁 상자를 돌려준다. */
  async function hover(selector: string, text: string): Promise<HTMLElement> {
    const el = container.querySelector<HTMLElement>(selector);
    expect(el, selector).not.toBeNull();
    await act(async () => {
      el!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, clientX: 10, clientY: 10 }));
    });
    await act(async () => {
      await settle(2200);
    });
    await act(async () => {
      await settle(50);
    });
    const box = [...document.querySelectorAll<HTMLElement>(".ag-tooltip")].find((b) =>
      b.textContent?.includes(text)
    );
    expect(box, `툴팁 ${text}`).toBeTruthy();
    return box!;
  }

  /** 상자가 마우스를 받지 않는다 — 인라인 pointer-events:none 이고, 상자 자신에 ag-grid 상호작용 클래스가 없다. */
  function expectNoPointer(box: HTMLElement) {
    expect(box.style.pointerEvents).toBe("none");
    expect(box.classList.contains("ag-tooltip-interactive")).toBe(false);
  }

  it("MDM 이 아닌 열의 기본 셀 툴팁 상자는 마우스를 받지 않는다", async () => {
    await show();
    expectNoPointer(await hover('.ag-row[row-index="0"] .ag-cell[col-id="etc"]', "E1"));
  }, 15000);

  it("검증 오류 셀 툴팁(fieldErrors) 상자는 마우스를 받지 않는다", async () => {
    await show({ fieldErrors: [{ rowIndex: 0, field: "etc", message: "서버: 기타 오류" }] });
    expectNoPointer(
      await hover('.ag-row[row-index="0"] .ag-cell[col-id="etc"]', "서버: 기타 오류")
    );
  }, 15000);

  it("HTML 열의 셀 툴팁(MDM 셀 툴팁) 상자는 마우스를 받지 않는다", async () => {
    await show();
    expectNoPointer(await hover('.ag-row[row-index="0"] .ag-cell[col-id="noticeBody"]', "B1"));
  }, 15000);

  it("글자 MDM 머리글 카드 상자는 마우스를 받지 않는다", async () => {
    await show();
    const box = await hover('.ag-header-cell[col-id="title"]', "공지 제목");
    expect(box.classList.contains("mdm-meta-tooltip")).toBe(true);
    expectNoPointer(box);
  }, 15000);
});
