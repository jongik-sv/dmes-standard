/** @vitest-environment happy-dom */
/**
 * AgDataGrid × MDM 컬럼 설명 HTML — 머리글 라벨 포털 카드(리뷰 반영 I1 ③, 2026-10-03).
 *  - HTML 설명 카드를 가진 MDM 열은 ag-grid 기본 머리글의 innerHeaderComponent(MdmHeaderLabel)가 캡션을 그리고, 그 라벨에 마우스를
 *    올리면 useHoverTip 상호작용 모드로 MdmMetaCard(HTML)를 document.body 포털에 띄운다. ag-grid 머리글 툴팁은 걸지 않는다.
 *  - 그리드 tooltipInteraction 은 쓰지 않는다 — 셀·검증 오류·글자 머리글 툴팁은 예전과 같다.
 *  - 메타는 그리드를 만든 뒤 오므로 라벨이 생기거나 빠질 때 머리글을 한 번 다시 만든다(refreshHeader, 0단계 시험 참고).
 *  - 라벨 카드는 ag-grid 머리글 툴팁과 같은 표시 지연(기본 2000ms)을 두고, 라벨을 누르면(정렬·끌기 시작) 닫힌다. 버튼을 누른 채 지나가면 열지 않는다.
 *  - 표시 이름이 빈 열(header: "")은 라벨을 달지 않고 예전 글자 머리글 카드(칸 전체)로 둔다.
 *  - 카드 안 조작(누름·더블클릭·문맥 메뉴·↑↓)이 정렬·행 선택·행 이동을 일으키지 않고, 카드 안 focus 에서도 Escape 로 닫힌다.
 */
import { StrictMode, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColDef, ColGroupDef, GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  AgDataGrid,
  MdmGridTooltip,
  buildColumnDefs,
  type GridColumn,
} from "../../src/components/grid/AgDataGrid";
import {
  MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS,
  MdmHeaderLabel,
} from "../../src/components/grid/MdmHeaderLabel";
import { MdmMetaProvider, resetMdmMetaStore, type MdmColumnInfo } from "../../src/mdm-meta";
import { TEXT_DOMAIN, TITLE, column, fakeMetaFetch, settle } from "./mdm-meta-fixtures";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = column("NOTICE_BODY", {
  columnName: "본문",
  labelShort: "본문",
  description: "굵은 설명 링크",
  descriptionHtml: '<p><b>굵은</b> 설명 <a href="https://example.com/doc">링크</a></p>',
});

const OPTS = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
const info = (c: MdmColumnInfo["column"], d: MdmColumnInfo["domain"] = null): MdmColumnInfo => ({
  column: c,
  domain: d,
  loading: false,
});
const mdm = (entries: Array<[string, MdmColumnInfo]>) => ({
  priority: "explicit" as const,
  infoByKey: new Map(entries),
});

describe("buildColumnDefs — HTML 설명 열은 머리글 라벨(innerHeaderComponent)", () => {
  it("HTML 카드 열: innerHeaderComponent=MdmHeaderLabel·메타 인자, 머리글 툴팁 없음, 셀 툴팁 경로(MdmGridTooltip)는 그대로", () => {
    const [d] = buildColumnDefs([{ key: "noticeBody" }], {
      ...OPTS,
      mdm: mdm([["noticeBody", info(BODY)]]),
    }) as ColDef[];
    expect(d.headerName).toBe("본문");
    expect(d.headerComponentParams).toEqual({
      innerHeaderComponent: MdmHeaderLabel,
      innerHeaderComponentParams: { mdmColumn: BODY, mdmDomain: null },
    });
    expect(d.headerTooltip).toBeUndefined();
    expect(d.tooltipComponent).toBe(MdmGridTooltip);
    expect(d.tooltipComponentParams).toEqual({ mdmColumn: BODY, mdmDomain: null });
  });

  it("열 그룹 안의 HTML 열도 같다", () => {
    const defs = buildColumnDefs(
      [{ key: "g", header: "묶음", children: [{ key: "noticeBody" }] }],
      {
        ...OPTS,
        mdm: mdm([["noticeBody", info(BODY)]]),
      }
    );
    const leaf = (defs[0] as ColGroupDef).children[0] as ColDef;
    expect(leaf.headerComponentParams.innerHeaderComponent).toBe(MdmHeaderLabel);
  });

  it("화면이 준 headerComponentParams 에 innerHeaderComponent 만 더한다", () => {
    const [d] = buildColumnDefs([{ key: "noticeBody", headerComponentParams: { foo: 1 } }], {
      ...OPTS,
      mdm: mdm([["noticeBody", info(BODY)]]),
    }) as ColDef[];
    expect(d.headerComponentParams).toEqual({
      foo: 1,
      innerHeaderComponent: MdmHeaderLabel,
      innerHeaderComponentParams: { mdmColumn: BODY, mdmDomain: null },
    });
  });

  it('표시 이름이 빈 열(header: "")은 라벨을 달지 않고 예전 글자 머리글 카드(칸 전체, 물리명 툴팁)로 둔다', () => {
    const [d] = buildColumnDefs([{ key: "noticeBody", header: "" }], {
      ...OPTS,
      mdm: mdm([["noticeBody", info(BODY)]]),
    }) as ColDef[];
    expect(d.headerName).toBe("");
    expect(d.headerComponentParams).toBeUndefined();
    expect(d.headerTooltip).toBe("NOTICE_BODY");
    expect(d.tooltipComponent).toBe(MdmGridTooltip);
  });

  it("화면이 innerHeaderComponent 를 이미 줬으면 손대지 않고 예전 글자 머리글 툴팁으로 둔다", () => {
    const Inner = () => null;
    const [d] = buildColumnDefs(
      [{ key: "noticeBody", headerComponentParams: { innerHeaderComponent: Inner } }],
      {
        ...OPTS,
        mdm: mdm([["noticeBody", info(BODY)]]),
      }
    ) as ColDef[];
    expect(d.headerComponentParams).toEqual({ innerHeaderComponent: Inner });
    expect(d.headerTooltip).toBe("본문");
    expect(d.tooltipComponent).toBe(MdmGridTooltip);
  });

  it("글자(비 HTML) MDM 열은 예전과 같다 — headerComponentParams 를 더하지 않고 머리글 툴팁(MdmGridTooltip)", () => {
    const [d] = buildColumnDefs([{ key: "title" }], {
      ...OPTS,
      mdm: mdm([["title", info(TITLE, TEXT_DOMAIN)]]),
    }) as ColDef[];
    expect(d.headerComponentParams).toBeUndefined();
    expect(d.headerTooltip).toBe("제목");
    expect(d.tooltipComponent).toBe(MdmGridTooltip);
    // 소독 뒤 보이는 내용이 없는 HTML 도 글자 카드 경로(리뷰 M1)
    const [e] = buildColumnDefs([{ key: "x" }], {
      ...OPTS,
      mdm: mdm([["x", info(column("X", { descriptionHtml: "<script>x</script>" }))]]),
    }) as ColDef[];
    expect(e.headerComponentParams).toBeUndefined();
    expect(e.headerTooltip).toBe("x");
  });
});

describe("MdmGridTooltip — 머리글 카드는 늘 글자 카드(상호작용 없음)", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    vi.restoreAllMocks();
  });

  it("HTML 열이 글자 툴팁 경로로 떨어져도 HTML 을 넣지 않고 상자는 예전 그대로(max-content·380), 문서 이벤트를 듣지 않는다", () => {
    const add = vi.spyOn(document, "addEventListener");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        createElement(MdmGridTooltip, {
          location: "header",
          value: "본문",
          mdmColumn: BODY,
          mdmDomain: null,
        } as never)
      )
    );
    const box = host.querySelector<HTMLElement>(".ag-tooltip")!;
    expect(box.getAttribute("style")).toBe("width: max-content; max-width: 380px;");
    expect(box.querySelector("[data-mdm-html]")).toBeNull();
    expect(box.querySelector("a")).toBeNull();
    expect(box.textContent).toContain("굵은 설명 링크");
    expect(add.mock.calls.filter(([t]) => t === "keydown" || t === "mousedown")).toHaveLength(0);
  });
});

describe("AgDataGrid — HTML 설명 머리글 라벨 포털 카드(실제 그리드)", () => {
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
    document
      .querySelectorAll(".ag-tooltip-custom, .ag-tooltip, .form-tip-text--portal")
      .forEach((el) => el.remove());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const COLUMNS: GridColumn[] = [
    { key: "title" },
    { key: "noticeBody" },
    { key: "etc", header: "기타", meta: false },
  ];
  const DATA = [
    { title: "T1", noticeBody: "B1", etc: "E1" },
    { title: "T2", noticeBody: "B2", etc: "E2" },
  ];

  async function settleAll() {
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await settle(60);
      });
    }
  }
  async function render(el: ReactNode) {
    await act(async () => root!.render(el));
    await settleAll();
  }
  function grid(props: Record<string, unknown> = {}, provider: Record<string, unknown> = {}) {
    return createElement(
      MdmMetaProvider,
      { module: "mls", ...provider },
      createElement(AgDataGrid, {
        columns: COLUMNS,
        data: DATA,
        rowKey: "title",
        height: "auto",
        ...props,
      })
    );
  }
  function stub() {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE, NOTICE_BODY: BODY } }).fn);
  }

  const headerCell = (colId: string) =>
    container.querySelector<HTMLElement>(`.ag-header-cell[col-id="${colId}"]`)!;
  const label = (colId: string) =>
    headerCell(colId)?.querySelector<HTMLElement>(".mdm-header-label") ?? null;
  const portal = () => document.querySelector<HTMLElement>(".form-tip-text--portal");
  function rect(over: Partial<DOMRect>): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...over,
    } as DOMRect;
  }
  function placeLabel(colId = "noticeBody") {
    const el = label(colId)!;
    el.getBoundingClientRect = () => rect({ left: 100, top: 40, bottom: 60 });
    return el;
  }
  const over = (el: Element, buttons = 0) =>
    act(() => {
      el.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: null, buttons })
      );
    });
  const out = (el: Element) =>
    act(() => {
      el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
    });
  const pointerDown = (el: Element) =>
    act(() => {
      const Ctor =
        (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
      el.dispatchEvent(new Ctor("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
    });
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  /** 라벨에 올리고 표시 지연(가짜 타이머)을 넘겨 카드를 띄운다. */
  async function hoverLabel(colId = "noticeBody") {
    const el = placeLabel(colId);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      over(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS);
    } finally {
      vi.useRealTimers();
    }
    return portal()!;
  }
  const fire = async (el: Element, ev: Event) => {
    await act(async () => {
      el.dispatchEvent(ev);
    });
  };

  it("메타가 그리드를 만든 뒤 와도 HTML 열 머리글은 라벨(MdmHeaderLabel)이 MDM 캡션을 그리고, 글자 MDM 열·MDM 아닌 열은 예전 그대로 글자다", async () => {
    stub();
    await render(grid());
    expect(label("noticeBody")?.textContent).toBe("본문");
    expect(headerCell("noticeBody").querySelector(".ag-header-cell-text")?.textContent).toBe(
      "본문"
    );
    expect(label("title")).toBeNull();
    expect(headerCell("title").querySelector(".ag-header-cell-text")?.innerHTML).toBe("제목");
    expect(headerCell("etc").querySelector(".ag-header-cell-text")?.innerHTML).toBe("기타");
    // 말줄임: 라벨을 감싼 ag-grid React 감싸개는 display:contents 클래스를 받는다(grid.css).
    expect(label("noticeBody")!.parentElement?.classList.contains("mdm-header-label-host")).toBe(
      true
    );
  });

  it('captionPriority="mdm" 이면 적은 header 대신 MDM 캡션이 라벨에 보인다(메타 도착 뒤)', async () => {
    stub();
    const cols: GridColumn[] = [{ key: "title" }, { key: "noticeBody", header: "화면 본문" }];
    await render(
      createElement(
        MdmMetaProvider,
        { module: "mls", captionPriority: "mdm" },
        createElement(AgDataGrid, { columns: cols, data: DATA, rowKey: "title", height: "auto" })
      )
    );
    expect(label("noticeBody")?.textContent).toBe("본문");
  });

  it("라벨에 올리면 body 포털에 상호작용 HTML 카드(640·pointer auto)가 뜨고, 떠나면 150ms 유예 뒤 닫힌다 — ag-grid 머리글 툴팁은 뜨지 않는다", async () => {
    stub();
    await render(grid());
    const p = await hoverLabel();
    expect(p.parentElement).toBe(document.body);
    expect(p.getAttribute("data-tip-interactive")).toBe("true");
    expect(p.style.pointerEvents).toBe("auto");
    expect(p.style.maxWidth).toBe("640px");
    expect(p.querySelector('[data-mdm-html="true"] b')?.textContent).toBe("굵은");
    await fire(
      label("noticeBody")!,
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })
    );
    expect(portal()).not.toBeNull();
    await act(async () => {
      await settle(200);
    });
    expect(portal()).toBeNull();
    // ag-grid 머리글 툴팁(2초 지연)은 이 열에 없다
    await fire(
      headerCell("noticeBody"),
      new MouseEvent("mouseenter", { bubbles: false, clientX: 10, clientY: 10 })
    );
    await act(async () => {
      await settle(2300);
    });
    expect(document.querySelector(".mdm-meta-tooltip")).toBeNull();
  }, 15000);

  it("스크린리더 설명: 라벨의 aria-describedby 가 body 의 글자 사본(링크 없음)을 가리킨다", async () => {
    stub();
    await render(grid());
    const id = label("noticeBody")!.getAttribute("aria-describedby")!;
    const sr = document.getElementById(id)!;
    expect(sr.className).toBe("form-sr-only");
    expect(sr.textContent).toContain("굵은 설명 링크");
    expect(sr.querySelector("a")).toBeNull();
  });

  it("카드 안에서 누름·더블클릭·문맥 메뉴는 정렬·행 선택을 일으키지 않고, 라벨을 누르면 정렬된다", async () => {
    stub();
    const onRowClick = vi.fn();
    await render(grid({ onRowClick }));
    const p = await hoverLabel();
    const sortBefore = headerCell("noticeBody").getAttribute("aria-sort");
    expect(sortBefore).not.toBe("ascending");
    const inside = p.querySelector('[data-mdm-html="true"]')!;
    for (const type of ["mousedown", "mouseup", "click", "dblclick", "contextmenu"]) {
      await fire(inside, new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
    expect(headerCell("noticeBody").getAttribute("aria-sort")).toBe(sortBefore);
    expect(onRowClick).not.toHaveBeenCalled();
    await fire(label("noticeBody")!, new MouseEvent("click", { bubbles: true }));
    expect(headerCell("noticeBody").getAttribute("aria-sort")).toBe("ascending");
  });

  it("카드 안에서 ↑↓ 는 그리드 행 커서를 옮기지 않는다(리뷰 M4) — 카드 밖 그리드에서는 옮긴다", async () => {
    stub();
    const onRowClick = vi.fn();
    await render(grid({ onRowClick }));
    const p = await hoverLabel();
    const link = p.querySelector("a")!;
    await fire(
      link,
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
    );
    expect(onRowClick).not.toHaveBeenCalled();
    const gridBox = container.querySelector(".cm-data-grid")!;
    await fire(
      gridBox,
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
    );
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("카드 안(링크)에 focus 가 있어도 Escape 로 닫힌다", async () => {
    stub();
    await render(grid());
    const p = await hoverLabel();
    await fire(p, new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    const link = p.querySelector("a")!;
    await act(async () => link.focus());
    await fire(
      link,
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    expect(portal()).toBeNull();
  });

  it("그리드 tooltipInteraction 을 쓰지 않는다 — HTML 열이 있는 그리드의 셀 툴팁도 예전처럼 상호작용이 아니다", async () => {
    stub();
    await render(grid());
    await fire(
      container.querySelector('.ag-row[row-index="0"] .ag-cell[col-id="etc"]')!,
      new MouseEvent("mouseenter", { bubbles: false, clientX: 10, clientY: 10 })
    );
    await act(async () => {
      await settle(2300);
    });
    const tip = [...document.querySelectorAll<HTMLElement>(".ag-tooltip")].find(
      (b) => b.textContent === "E1"
    );
    expect(tip, "셀 툴팁").toBeTruthy();
    expect(document.querySelector(".ag-tooltip-interactive")).toBeNull();
  }, 15000);

  it("HTML 열이 사라지면(meta: false) 라벨도 빠지고 머리글은 글자로 돌아간다", async () => {
    stub();
    await render(grid());
    expect(label("noticeBody")).not.toBeNull();
    const cols: GridColumn[] = [
      { key: "title" },
      { key: "noticeBody", header: "본문(화면)", meta: false },
      COLUMNS[2],
    ];
    await render(grid({ columns: cols }));
    expect(label("noticeBody")).toBeNull();
    expect(headerCell("noticeBody").querySelector(".ag-header-cell-text")?.innerHTML).toBe(
      "본문(화면)"
    );
  });

  it("HTML 열이 없는 그리드는 머리글을 다시 만들지 않고 라벨·감싸개가 없다", async () => {
    vi.stubGlobal("fetch", fakeMetaFetch({ columns: { TITLE } }).fn);
    await render(grid());
    const before = headerCell("title");
    await settleAll();
    expect(headerCell("title")).toBe(before);
    expect(container.querySelector(".ag-header .ag-react-container")).toBeNull();
    expect(container.querySelector(".mdm-header-label")).toBeNull();
  });

  it("StrictMode(개발 모드 효과 재실행)에서도 라벨이 생기고 카드가 뜬다", async () => {
    stub();
    await render(createElement(StrictMode, null, grid()));
    expect(label("noticeBody")?.textContent).toBe("본문");
    const p = await hoverLabel();
    expect(p.querySelector('[data-mdm-html="true"]')).not.toBeNull();
  });

  it("말줄임: 라벨이 감싸개(display:contents) 규칙을 문서 머리에 한 번 스스로 싣는다 — 호스트 grid.css 에 기대지 않는다", async () => {
    stub();
    await render(grid());
    expect(label("noticeBody")!.parentElement?.classList.contains("mdm-header-label-host")).toBe(
      true
    );
    const styles = [...document.head.querySelectorAll("style")].filter((el) =>
      el.textContent?.includes(".mdm-header-label-host")
    );
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(
      /\.ag-header-cell-text\s*>\s*\.mdm-header-label-host\s*\{[^}]*display:\s*contents/
    );
  });

  describe("표시 지연·누름 닫힘(재검토 N1, 가짜 타이머)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it(`지연(${MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS}ms) 전에 떠나면 카드가 뜨지 않는다`, async () => {
      stub();
      await render(grid());
      const el = placeLabel();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      over(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS - 1);
      expect(portal()).toBeNull();
      out(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS * 2);
      expect(portal()).toBeNull();
    });

    it("지연이 지나면 카드가 뜬다 — 그리드 기본 tooltipShowDelay(2000ms)와 같다", async () => {
      expect(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS).toBe(2000);
      stub();
      await render(grid());
      const el = placeLabel();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      over(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS - 1);
      expect(portal()).toBeNull();
      advance(1);
      expect(portal()?.getAttribute("data-tip-interactive")).toBe("true");
    });

    it("라벨을 누르면(정렬·끌기 시작) 대기를 취소하고 열린 카드를 바로 닫는다", async () => {
      stub();
      await render(grid());
      const el = placeLabel();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      over(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS);
      expect(portal()).not.toBeNull();
      pointerDown(el);
      expect(portal()).toBeNull();
      // 대기 중에 누르면 열리지 않는다
      out(el);
      over(el);
      advance(500);
      pointerDown(el);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS * 2);
      expect(portal()).toBeNull();
    });

    it("버튼을 누른 채 지나가면(열 끌기 중) 열지 않는다", async () => {
      stub();
      await render(grid());
      const el = placeLabel();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      over(el, 1);
      advance(MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS * 2);
      expect(portal()).toBeNull();
    });
  });

  it("열 그룹 안의 HTML 열도 메타가 그리드를 만든 뒤 오면 라벨이 붙는다(재검토 N6)", async () => {
    stub();
    const cols: GridColumn[] = [
      { key: "title" },
      { key: "grp", header: "묶음", children: [{ key: "noticeBody" }] },
    ];
    await render(grid({ columns: cols }));
    expect(label("noticeBody")?.textContent).toBe("본문");
    const p = await hoverLabel();
    expect(p.querySelector('[data-mdm-html="true"]')).not.toBeNull();
  });

  describe("refreshHeader 호출 횟수(재검토 N6)", () => {
    /** 메타 응답을 손으로 풀 때까지 붙잡는 fetch. */
    function gatedFetch(columns: Record<string, ReturnType<typeof column>>) {
      const f = fakeMetaFetch({ columns });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        await gate;
        return f.fn(input, init);
      });
      vi.stubGlobal("fetch", fn);
      return { release };
    }
    /** AgDataGrid 가 쓰는 AgGridReact 인스턴스의 api — render 의 this 로 잡는다. */
    function gridApi(renderSpy: { mock: { contexts: unknown[] } }): GridApi {
      const inst = renderSpy.mock.contexts.at(-1) as { api?: GridApi };
      expect(inst?.api, "그리드 api").toBeTruthy();
      return inst.api!;
    }

    it("HTML 열이 없는 그리드는 메타 도착 전후로 refreshHeader 를 부르지 않는다", async () => {
      const renderSpy = vi.spyOn(AgGridReact.prototype, "render");
      const { release } = gatedFetch({ TITLE });
      await render(grid());
      const refresh = vi.spyOn(gridApi(renderSpy), "refreshHeader");
      expect(headerCell("title").querySelector(".ag-header-cell-text")?.textContent).toBe("title");
      await act(async () => release());
      await settleAll();
      expect(headerCell("title").querySelector(".ag-header-cell-text")?.textContent).toBe("제목");
      expect(refresh).not.toHaveBeenCalled();
    });

    it("HTML 열 그리드는 메타 도착 때 한 번 부르고, data 만 바꾼 다시 렌더에서는 더 부르지 않는다", async () => {
      const renderSpy = vi.spyOn(AgGridReact.prototype, "render");
      const { release } = gatedFetch({ TITLE, NOTICE_BODY: BODY });
      await render(grid());
      const refresh = vi.spyOn(gridApi(renderSpy), "refreshHeader");
      expect(label("noticeBody")).toBeNull();
      await act(async () => release());
      await settleAll();
      expect(label("noticeBody")?.textContent).toBe("본문");
      expect(refresh).toHaveBeenCalledTimes(1);
      await render(grid({ data: [{ title: "T9", noticeBody: "B9", etc: "E9" }] }));
      await render(grid({ data: [...DATA] }));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
