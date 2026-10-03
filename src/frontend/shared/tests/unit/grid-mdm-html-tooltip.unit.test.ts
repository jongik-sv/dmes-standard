/** @vitest-environment happy-dom */
/**
 * AgDataGrid × MDM 컬럼 설명 HTML(2026-10-03).
 *  - MdmGridTooltip: HTML 카드면 상자 최대 폭 640px·pointer-events:auto, Escape 로 닫는다(ag-grid hideTooltipCallback).
 *    일반 글 카드·셀 툴팁 상자는 예전 그대로(max-content · 380px).
 *  - tooltipInteraction 은 열 MDM 메타 중 descriptionHtml 이 있는 열이 있는 그리드에서만 켠다. 메타는 그리드를 만든 뒤 오고
 *    tooltipInteraction 은 ag-grid 초기 속성이라, 켜질 때 머리글을 다시 만들어(refreshHeader) 새 값이 머리글 툴팁에 들게 한다.
 */
import { StrictMode, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgDataGrid,
  MdmGridTooltip,
  buildColumnDefs,
  hasMdmHtmlHeaderTooltip,
  type GridColumn,
} from "../../src/components/grid/AgDataGrid";
import { MdmMetaProvider, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelShort: "본문",
  description: "굵은 설명",
  descriptionHtml: "<p><b>굵은</b> 설명</p>",
});

describe("MdmGridTooltip — HTML 카드", () => {
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
  const box = () => host.querySelector<HTMLElement>(".ag-tooltip")!;
  const escape = () =>
    act(
      () =>
        void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );

  it("머리글 HTML 카드 상자는 최대 폭 640px 이고 마우스가 들어갈 수 있다(pointer-events:auto — ag-grid 는 감싸개에만 interactive 클래스를 단다)", () => {
    render(
      createElement(MdmGridTooltip, {
        location: "header",
        value: "본문",
        mdmColumn: BODY,
        mdmDomain: null,
      } as never)
    );
    expect(box().style.width).toBe("max-content");
    expect(box().style.maxWidth).toBe("640px");
    expect(box().style.pointerEvents).toBe("auto");
    expect(box().querySelector('[data-mdm-html="true"] b')?.textContent).toBe("굵은");
  });

  it("일반 글 카드와 셀 툴팁 상자는 예전 그대로(max-content · 380px · pointer-events 없음)", () => {
    render(
      createElement(MdmGridTooltip, {
        location: "header",
        value: "제목",
        mdmColumn: TITLE,
        mdmDomain: TEXT_DOMAIN,
      } as never)
    );
    expect(box().getAttribute("style")).toBe("width: max-content; max-width: 380px;");
    act(() =>
      root!.render(
        createElement(MdmGridTooltip, {
          location: "cell",
          value: "긴 값",
          mdmColumn: BODY,
        } as never)
      )
    );
    expect(box().getAttribute("style")).toBe("width: max-content; max-width: 380px;");
  });

  it("HTML 카드는 Escape 로 닫는다(hideTooltipCallback) — 일반 글 카드는 문서 keydown 을 듣지 않는다", () => {
    const hide = vi.fn();
    render(
      createElement(MdmGridTooltip, {
        location: "header",
        value: "본문",
        mdmColumn: BODY,
        hideTooltipCallback: hide,
      } as never)
    );
    escape();
    expect(hide).toHaveBeenCalledTimes(1);
    act(
      () =>
        void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    );
    expect(hide).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    host.remove();
    const plainHide = vi.fn();
    render(
      createElement(MdmGridTooltip, {
        location: "header",
        value: "제목",
        mdmColumn: TITLE,
        hideTooltipCallback: plainHide,
      } as never)
    );
    escape();
    expect(plainHide).not.toHaveBeenCalled();
  });
});

describe("hasMdmHtmlHeaderTooltip — 열 정의(그룹 안까지)", () => {
  const OPTS = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
  const info = (c: MdmColumnInfo["column"]): MdmColumnInfo => ({
    column: c,
    domain: null,
    loading: false,
  });
  const mdm = (entries: Array<[string, MdmColumnInfo]>) => ({
    priority: "explicit" as const,
    infoByKey: new Map(entries),
  });

  it("HTML 설명 카드를 머리글 툴팁으로 다는 열이 그룹 안에라도 있으면 참", () => {
    const cols: GridColumn[] = [
      { key: "title" },
      { key: "g", header: "묶음", children: [{ key: "body" }] },
    ];
    expect(
      hasMdmHtmlHeaderTooltip(
        buildColumnDefs(cols, {
          ...OPTS,
          mdm: mdm([
            ["title", info(TITLE)],
            ["body", info(BODY)],
          ]),
        })
      )
    ).toBe(true);
  });

  it("HTML 열이 없거나, 화면이 그 열에 headerTooltip 을 줘 카드를 달지 않으면 거짓", () => {
    expect(
      hasMdmHtmlHeaderTooltip(
        buildColumnDefs([{ key: "title" }], { ...OPTS, mdm: mdm([["title", info(TITLE)]]) })
      )
    ).toBe(false);
    expect(hasMdmHtmlHeaderTooltip(buildColumnDefs([{ key: "body" }], OPTS))).toBe(false);
    expect(
      hasMdmHtmlHeaderTooltip(
        buildColumnDefs([{ key: "body", headerTooltip: "화면 툴팁" }], {
          ...OPTS,
          mdm: mdm([["body", info(BODY)]]),
        })
      )
    ).toBe(false);
  });
});

describe("AgDataGrid — tooltipInteraction 은 HTML 열이 있는 그리드에서만", () => {
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

  async function show(el: ReactNode) {
    await act(async () => root!.render(el));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await settle(80);
      });
    }
  }

  /** 머리글 칸에 마우스를 올리고 ag-grid 기본 표시 지연(2000ms)을 넘겨 기다린다. */
  async function hoverHeader(colId: string) {
    const cell = container.querySelector<HTMLElement>(`.ag-header-cell[col-id="${colId}"]`);
    expect(cell, `머리글 ${colId}`).not.toBeNull();
    await act(async () => {
      cell!.dispatchEvent(
        new MouseEvent("mouseenter", { bubbles: false, clientX: 10, clientY: 10 })
      );
    });
    await act(async () => {
      await settle(2200);
    });
    await act(async () => {
      await settle(50);
    });
  }

  async function expectInteractiveHeaderTip(colId: string) {
    await hoverHeader(colId);
    const tip = document.querySelector<HTMLElement>(".mdm-meta-tooltip");
    expect(tip, "머리글 툴팁").not.toBeNull();
    expect(tip!.closest(".ag-tooltip-interactive"), "상호작용 감싸개").not.toBeNull();
    expect(tip!.style.pointerEvents).toBe("auto");
    expect(tip!.querySelector('[data-mdm-html="true"]')).not.toBeNull();
  }

  it("메타가 그리드를 만든 뒤 와도 HTML 열 머리글 툴팁은 상호작용(ag-tooltip-interactive)이다 — 열 그룹 안의 열", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, NOTICE_BODY: BODY } }).fn);
    const columns: GridColumn[] = [
      { key: "title" },
      { key: "grp", header: "묶음", children: [{ key: "noticeBody" }] },
    ];
    await show(
      createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(AgDataGrid, { columns, rowKey: "title", data: [] })
      )
    );
    expect(
      [...container.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent)
    ).toEqual(["제목", "본문"]);
    await expectInteractiveHeaderTip("noticeBody");
    // 툴팁 안(링크 등에 focus)에서 누른 Escape — ag-grid 는 툴팁 밖 keydown 에만 닫으므로 카드의 문서 keydown 이 닫는다.
    const inside = document.querySelector<HTMLElement>('.mdm-meta-tooltip [data-mdm-html="true"]')!;
    await act(async () => {
      inside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(
      document.querySelector(".ag-tooltip-interactive")?.classList.contains("ag-tooltip-hiding")
    ).toBe(true);
  }, 15000);

  // StrictMode + 열 그룹 + MDM 공급자 조합은 이 변경 전 dev 에서도 happy-dom 에서 ag-grid 가 죽는다(getProvidedColumnGroup null) — 따로 본다.
  it("StrictMode(개발 모드 효과 재실행)에서도 머리글을 다시 만들고 상호작용 툴팁이 된다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, NOTICE_BODY: BODY } }).fn);
    const columns: GridColumn[] = [{ key: "title" }, { key: "noticeBody" }];
    await show(
      createElement(
        StrictMode,
        null,
        createElement(
          MdmMetaProvider,
          { module: "mls" },
          createElement(AgDataGrid, { columns, rowKey: "title", data: [] })
        )
      )
    );
    expect(
      [...container.querySelectorAll(".ag-header-cell-text")].map((el) => el.textContent)
    ).toEqual(["제목", "본문"]);
    await expectInteractiveHeaderTip("noticeBody");
  }, 15000);

  it("HTML 열이 없는 그리드의 머리글 툴팁은 예전처럼 상호작용이 아니다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await show(
      createElement(
        MdmMetaProvider,
        { module: "mls" },
        createElement(AgDataGrid, {
          columns: [{ key: "title" }, { key: "etc", header: "기타" }],
          rowKey: "title",
          data: [],
        })
      )
    );
    await hoverHeader("title");
    const tip = document.querySelector<HTMLElement>(".mdm-meta-tooltip");
    expect(tip, "머리글 툴팁").not.toBeNull();
    expect(document.querySelector(".ag-tooltip-interactive")).toBeNull();
    expect(tip!.style.pointerEvents).toBe("");
  }, 15000);
});
