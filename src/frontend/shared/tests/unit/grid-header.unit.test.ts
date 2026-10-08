/** @vitest-environment happy-dom */
/**
 * 모든 그리드 위의 머리줄과 「걸린 조건」 칩 줄 — 실제 ag-grid·MantineProvider 로 그린다.
 * - GridPanel 안 그리드는 GridPanel 머리줄 하나뿐이고(중복 없음), GridPanel 밖 그리드는 스스로 같은 머리줄(GridHeaderBar)을 그린다.
 * - title 이 없으면 건수 배지와 메뉴만, header={false} 는 예전처럼 머리글 줄 설정 아이콘. 대화 상자 안은 머리줄은 있고 검색 칸은 없다.
 * - 칩: 검색어·칸별 조건이 칩으로 보이고 × 가 그 조건만 지운다. 조건이 없으면 칩 줄 DOM 이 없다.
 * - 머리줄을 달아도 AgGridReact 렌더 수·열 정의가 header={false}(= 예전 동작)와 같다.
 * 칩 이름·값 요약은 순수 함수 describeFilterModel 로 따로 본다.
 */
import { readFileSync } from "node:fs";
import { act, createElement, useState, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { GridFilterChips } from "../../src/components/grid/GridFilterChips";
import { GRID_HEADER_HEIGHT } from "../../src/components/grid";
import { GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import type { GridFilterChip, GridPanelGridControls } from "../../src/components/grid/grid-panel-context";
import { GRID_QUICK_FILTER_DEBOUNCE_MS } from "../../src/components/grid/GridQuickFilter";
import { buildFilterChips, describeFilterModel, shortenChipValue } from "../../src/components/grid/grid-filter-chips";
import { Modal } from "../../src/components/modal";
import { FloatingPanel } from "../../src/components/floating-panel";
import { DetailPopover } from "../../src/components/detail-popover";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "A", name: "부품창고", qty: 1200 },
  { code: "B", name: "자재창고", qty: 300 },
  { code: "C", name: "부품대기", qty: 50 },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, {
    columns: COLUMNS,
    rowKey: "code",
    data: DATA,
    columnSizing: "fixed",
    height: 300,
    personalize: false,
    ...props,
  });
}
const panel = (child: ReactElement) => createElement(GridPanel, { title: "목록", count: DATA.length }, child);
const dialog = (child: ReactElement) => createElement("div", { role: "dialog" }, child);
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
async function reset() {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
}
function api(): GridApi {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed())[0]!;
}
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tids = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
const gridBox = () => document.querySelector<HTMLElement>(".cm-data-grid")!;
const chipTexts = () => tids("grid-filter-chip").map((el) => el.textContent);
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
function menuItems(): string[] {
  return [...tid("grid-settings-dropdown")!.children].map((el) => (el.textContent ?? "").trim()).filter((t) => t !== "");
}
async function typeQuick(text: string) {
  const input = tid("grid-quick-filter-input") as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(GRID_QUICK_FILTER_DEBOUNCE_MS + 60);
}
async function setQtyFilter(model: unknown) {
  await act(async () => {
    await api().setColumnFilterModel("qty", model);
    api().onFilterChanged();
  });
  await wait(30);
}

beforeEach(() => {
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await reset();
  vi.restoreAllMocks();
});

describe("머리줄 — GridPanel 안은 하나뿐, 밖은 스스로", () => {
  it("GridPanel 안 그리드는 GridPanel 머리줄 하나뿐이고 그리드 쪽 머리줄·바깥 상자는 없다", async () => {
    await show(panel(gridEl({ title: "그리드명" })));
    expect(document.querySelectorAll(".grid-panel-header").length).toBe(1);
    expect(tid("grid-with-header")).toBeNull();
    expect(tid("grid-panel-title")!.textContent).toBe("목록");
    expect(tids("grid-panel-settings-slot").length).toBe(1);
    expect(tid("grid-settings-overlay")).toBeNull();
    // 그리드 상자는 .grid-panel-content 의 직계 자식이다(예전 모양 그대로)
    expect(gridBox().parentElement!.classList.contains("grid-panel-content")).toBe(true);
  });

  it("GridPanel 밖 그리드는 title·건수 배지·설정 메뉴가 있는 머리줄을 표 위에 그린다", async () => {
    await show(gridEl({ title: "항목 — 고객사코드" }));
    const frame = tid("grid-with-header")!;
    expect(frame).not.toBeNull();
    expect(document.querySelectorAll(".grid-panel-header").length).toBe(1);
    const header = frame.querySelector(".grid-panel-header")!;
    expect(header.nextElementSibling).toBe(gridBox());
    expect(tid("grid-panel-title")!.textContent).toBe("항목 — 고객사코드");
    expect(tid("grid-panel-count")!.textContent).toBe("3건");
    expect(tid("grid-panel-count")!.classList.contains("grid-panel-count")).toBe(true);
    // 메뉴는 머리줄의 settings-slot 에만 있다 — 머리글 줄 오버레이와 겹치지 않는다
    expect(tid("grid-panel-settings-slot")!.contains(tid("grid-settings-menu"))).toBe(true);
    expect(tids("grid-settings-menu").length).toBe(1);
    expect(tid("grid-settings-overlay")).toBeNull();
    expect(gridBox().classList.contains("cm-grid-settings-on")).toBe(false);
    // GridPanel 안 그리드와 같은 규칙 — 검색 칸이 기본으로 보인다
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    // 숫자 height 는 표 높이 — 바깥 상자는 내용 높이이고 머리줄이 표 위에 더해진다(GridPanel 안 그리드와 같은 뜻)
    expect(frame.style.height).toBe("auto");
    expect(gridBox().style.height).toBe("300px");
    expect(frame.contains(gridBox())).toBe(true);
  });

  it("title 이 없으면 이름을 지어내지 않고 건수 배지와 메뉴만 그린다", async () => {
    await show(gridEl());
    expect(tid("grid-with-header")).not.toBeNull();
    expect(tid("grid-panel-title")).toBeNull();
    expect(document.querySelector(".grid-panel-title")!.children.length).toBe(1);
    expect(tid("grid-panel-count")!.textContent).toBe("3건");
    expect(tid("grid-settings-menu")).not.toBeNull();
  });

  it("header={false} 는 머리줄 없이 예전처럼 머리글 줄 오른쪽 끝의 설정 아이콘을 쓴다", async () => {
    await show(gridEl({ title: "그리드명", header: false }));
    expect(tid("grid-with-header")).toBeNull();
    expect(document.querySelector(".grid-panel-header")).toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(gridBox().contains(tid("grid-settings-overlay"))).toBe(true);
    expect(gridBox().classList.contains("cm-grid-settings-on")).toBe(true);
    expect(gridBox().parentElement).toBe(r!.host);
  });

  it("대화 상자 안 그리드는 머리줄은 있고 검색 칸은 없으며 메뉴는 엑셀 출력만 있다", async () => {
    await show(dialog(gridEl({ title: "대화 상자 목록" })));
    expect(tid("grid-with-header")).not.toBeNull();
    expect(tid("grid-panel-title")!.textContent).toBe("대화 상자 목록");
    expect(tid("grid-panel-count")!.textContent).toBe("3건");
    expect(tid("grid-quick-filter")).toBeNull();
    expect(tid("grid-panel-settings-slot")!.contains(tid("grid-settings-menu"))).toBe(true);
    expect(tid("grid-settings-overlay")).toBeNull();
    await openMenu();
    expect(menuItems()).toEqual(["엑셀 출력"]);
  });

  it("대화 상자 안 filter={true} 그리드도 검색 칸이 없다", async () => {
    await show(dialog(gridEl({ filter: true })));
    expect(tid("grid-with-header")).not.toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(tid("grid-filter-chips")).toBeNull();
  });

  it("filter={false}·settingsMenu={false} 예외는 그대로다 — 머리줄은 있고 검색 칸·메뉴 항목이 없다", async () => {
    await show(gridEl({ filter: false }));
    expect(tid("grid-with-header")).not.toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
    expect(tid("grid-excel")).not.toBeNull();
    await reset();
    await show(gridEl({ settingsMenu: false }));
    expect(tid("grid-with-header")).not.toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(tid("grid-settings-menu")).toBeNull();
    expect(tid("grid-panel-settings-slot")).toBeNull();
  });

  it("「칸별 필터 보기」 도 GridPanel 안 그리드와 같다 — 켜면 입력 줄이 펼쳐진다", async () => {
    await show(gridEl());
    expect(api().getGridOption("floatingFiltersHeight")).toBeUndefined();
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(api().getGridOption("floatingFiltersHeight")).toBeGreaterThan(0);
    expect(document.querySelectorAll(".ag-floating-filter").length).toBe(COLUMNS.length);
  });

  it("칸별 필터 입력 줄을 펴면 숫자 height 에 그 줄 높이를 더하고, 접으면 되돌린다 — 보이는 행 수가 줄지 않는다", async () => {
    await show(gridEl({ height: 300 }));
    expect(gridBox().style.height).toBe("300px");
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(gridBox().style.height).toBe(`${300 + GRID_FILTER_ROW_HEIGHT}px`);
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(gridBox().style.height).toBe("300px");
    // CSS 길이 문자열은 더하지 않는다
    await reset();
    await show(gridEl({ height: "400px" }));
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(gridBox().style.height).toBe("400px");
  });

  it("height=auto 와 height 생략도 바깥 상자가 높이를 갖고 표가 남은 높이를 채운다", async () => {
    await show(gridEl({ height: "auto" }));
    expect(tid("grid-with-header")!.style.height).toBe("auto");
    expect(tid("grid-with-header")!.classList.contains("cm-grid-with-header--auto")).toBe(true);
    expect(gridBox().style.height).toBe("auto");
    expect(gridBox().querySelector(".ag-layout-auto-height")).not.toBeNull();
    await reset();
    await show(gridEl({ height: undefined }));
    expect(tid("grid-with-header")!.style.height).toBe("100%");
    expect(gridBox().style.height).toBe(""); // 표 상자는 높이를 직접 갖지 않고 flex 로 남은 높이를 받는다
    expect(gridBox().style.flex).toContain("1 1 0");
    expect(gridBox().querySelector(".ag-layout-normal")).not.toBeNull();
  });

  it("숫자 height 는 표 높이이고 머리줄은 그 위에 더해진다 — 문자열 길이도 같고 100% 는 부모를 채운다", async () => {
    await show(gridEl({ height: 300 }));
    expect(tid("grid-with-header")!.style.height).toBe("auto");
    expect(tid("grid-with-header")!.classList.contains("cm-grid-with-header--sized")).toBe(true);
    expect(tid("grid-with-header")!.classList.contains("cm-grid-with-header--auto")).toBe(false);
    expect(gridBox().style.height).toBe("300px");
    expect(gridBox().style.flex).toBe("0 0 auto"); // flex: none — 바깥 상자가 줄어도 표 높이는 그대로
    expect(gridBox().previousElementSibling!.classList.contains("grid-panel-header")).toBe(true);
    await reset();
    await show(gridEl({ height: "400px" }));
    expect(tid("grid-with-header")!.style.height).toBe("auto");
    expect(gridBox().style.height).toBe("400px");
    await reset();
    await show(gridEl({ height: "100%" }));
    expect(tid("grid-with-header")!.style.height).toBe("100%");
    expect(tid("grid-with-header")!.classList.contains("cm-grid-with-header--sized")).toBe(false);
    expect(gridBox().style.height).toBe("");
    expect(gridBox().style.flex).toContain("1 1 0");
  });

  it("GridPanel 안 그리드의 숫자 height 도 표 상자의 높이다(머리줄은 GridPanel 이 표 위에 따로 그린다)", async () => {
    await show(panel(gridEl({ height: 300 })));
    expect(gridBox().style.height).toBe("300px");
    expect(gridBox().parentElement!.classList.contains("grid-panel-content")).toBe(true);
  });

  it("excelExport 를 주면 아래 줄 [엑셀] 단추는 머리줄 메뉴가 맡고(단추 없음) 「N행」 줄은 남는다", async () => {
    await show(gridEl({ excelExport: {} }));
    // 숫자 height 는 표 + 아래 줄 감싸개의 높이 — 바깥 상자(머리줄 + 감싸개)는 내용 높이다
    expect(tid("grid-with-header")!.style.height).toBe("auto");
    expect(tid("grid-excel-frame")!.style.height).toBe("300px");
    expect(tid("grid-excel-frame")!.style.flex).toBe("");
    expect(tid("grid-foot-note")!.textContent).toBe("3행");
    expect(tid("grid-excel")).toBeNull();
    await openMenu();
    expect(tid("grid-excel")).not.toBeNull();
  });

  it("height=auto 와 excelExport 를 함께 주면 엑셀 감싸개도 auto 틀을 유지한다(바깥 상자 안에서 0 으로 접히지 않는다)", async () => {
    await show(gridEl({ height: "auto", excelExport: {} }));
    const frame = tid("grid-excel-frame")!;
    expect(frame.classList.contains("cm-grid-excel--auto")).toBe(true);
    expect(frame.style.height).toBe("auto");
    expect(tid("grid-with-header")!.style.height).toBe("auto");
    expect(gridBox().style.height).toBe("auto");
  });

  it("MantineProvider 밖에서도 그리드와 머리줄(제목·건수)은 그리고 메뉴만 뺀다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host);
    await act(async () => {
      root.render(gridEl({ title: "밖" }));
    });
    await wait(120);
    expect(document.querySelector(".ag-header-cell")).not.toBeNull();
    expect(tid("grid-panel-title")!.textContent).toBe("밖");
    expect(tid("grid-settings-menu")).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});

/**
 * GridPanel 안에서 포털로 띄운 부품(Modal·FloatingPanel·DetailPopover) 속 그리드 — React 트리로는 GridPanel 의 자손이지만 부품이 등록부를 끊어 준다.
 * 바깥 GridPanel: 필터 생략 그리드(걸러 보기 대상 = 이 그리드). 부품 속 그리드는 filter={true} 라 끊기지 않았다면 GridPanel 의 걸러 보기 대상을 빼앗고 머리줄도 못 그린다.
 */
describe("GridPanel 안에서 띄운 포털 부품 속 그리드 — 등록부를 끊어 자기 머리줄을 그린다", () => {
  const INNER_DATA = [
    { code: "X", name: "대화 상자 행 하나", qty: 1 },
    { code: "Y", name: "대화 상자 행 둘", qty: 2 },
  ];
  const innerGrid = () => gridEl({ title: "부품 속 목록", data: INNER_DATA, filter: true, height: 160 });
  const outerGrid = () => gridEl({ title: "바깥 그리드" });
  const portalRoot = (selector: string) => document.querySelector<HTMLElement>(selector)!;

  /** 부품 속 그리드는 자기 머리줄을 그리고(제목·건수), 바깥 GridPanel 머리줄은 자기 그리드 기준으로 남는다. */
  async function expectIsolated(partSelector: string) {
    const part = portalRoot(partSelector);
    expect(part).not.toBeNull();
    // 부품 속 그리드: 스스로 그린 머리줄(제목·건수·엑셀 메뉴)이 있고, 대화 상자 판정(host=dialog)이 살아 있어 검색 칸·칩은 없다
    const inner = part.querySelector<HTMLElement>('[data-testid="grid-with-header"]');
    expect(inner).not.toBeNull();
    expect(inner!.querySelector('[data-testid="grid-panel-title"]')!.textContent).toBe("부품 속 목록");
    expect(inner!.querySelector('[data-testid="grid-panel-count"]')!.textContent).toBe("2건");
    expect(inner!.querySelector('[data-testid="grid-quick-filter"]')).toBeNull();
    expect(inner!.querySelector('[data-testid="grid-settings-menu"]')).not.toBeNull();
    // 바깥 GridPanel 은 하나뿐인 자기 머리줄을 그대로 가진다 — 건수 3건, 설정 메뉴 하나(부품 속 그리드는 메뉴 대상으로 등록되지 않았다)
    const outerPanel = document.querySelector<HTMLElement>(".grid-panel")!;
    expect(outerPanel.contains(part)).toBe(false); // 포털이라 DOM 은 GridPanel 밖
    expect(outerPanel.querySelector('[data-testid="grid-panel-title"]')!.textContent).toBe("목록");
    expect(outerPanel.querySelector('[data-testid="grid-panel-count"]')!.textContent).toBe("3건");
    expect(outerPanel.querySelectorAll('[data-testid="grid-settings-menu"]').length).toBe(1);
    // 바깥 GridPanel 의 걸러 보기 대상은 바깥 그리드다 — 검색어를 넣으면 바깥 건수가 「2 / 3건」 이 되고 부품 속 건수는 그대로
    expect(outerPanel.querySelector('[data-testid="grid-quick-filter-input"]')).not.toBeNull();
    const input = outerPanel.querySelector<HTMLInputElement>('[data-testid="grid-quick-filter-input"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "부품");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(GRID_QUICK_FILTER_DEBOUNCE_MS + 60);
    expect(outerPanel.querySelector('[data-testid="grid-panel-filter-count"]')!.textContent).toBe("2 / 3건");
    expect(inner!.querySelector('[data-testid="grid-panel-count"]')!.textContent).toBe("2건");
    expect(inner!.querySelector('[data-testid="grid-panel-filter-count"]')).toBeNull();
    // 바깥 칩 줄에는 바깥 조건만 보인다
    expect(outerPanel.querySelectorAll('[data-testid="grid-filter-chip"]').length).toBe(1);
    expect(inner!.querySelector('[data-testid="grid-filter-chip"]')).toBeNull();
  }

  it("Modal — 안 그리드가 자기 머리줄을 그리고 바깥 GridPanel 의 건수·검색 칸·메뉴 대상은 그대로다", async () => {
    await show(
      panel(createElement("div", { style: { height: 200 } }, outerGrid(), createElement(Modal, { open: true, title: "대화 상자" }, innerGrid()))),
    );
    await wait(300);
    await expectIsolated('[role="dialog"]');
  });

  it("FloatingPanel — 같다", async () => {
    await show(panel(createElement("div", { style: { height: 200 } }, outerGrid(), createElement(FloatingPanel, { open: true, title: "떠 있는 창", testId: "fp" }, innerGrid()))));
    await wait(200);
    await expectIsolated('[data-testid="fp"]');
  });

  it("DetailPopover — 같다", async () => {
    await show(panel(createElement("div", { style: { height: 200 } }, outerGrid(), createElement(DetailPopover, { title: "상세", content: innerGrid() }))));
    await act(async () => {
      const t = document.querySelector<HTMLElement>('[data-testid="detail-popover-trigger"]')!;
      t.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await wait(200);
    await expectIsolated('[data-testid="detail-popover-panel"]');
  });

  it("끊긴 경계 안에 새 GridPanel 을 두면 그 GridPanel 이 다시 자기 그리드를 맡는다(Modal 안 GridPanel)", async () => {
    await show(
      panel(
        createElement("div", { style: { height: 200 } }, outerGrid(), createElement(Modal, { open: true, title: "대화 상자" }, createElement(GridPanel, { title: "대화 상자 GridPanel", count: 2 }, gridEl({ data: INNER_DATA })))),
      ),
    );
    await wait(300);
    const dlg = portalRoot('[role="dialog"]');
    expect(dlg.querySelectorAll('[data-testid="grid-with-header"]').length).toBe(0); // 자기 GridPanel 이 머리줄을 그린다
    expect(dlg.querySelector('[data-testid="grid-panel-title"]')!.textContent).toBe("대화 상자 GridPanel");
    expect(dlg.querySelector('[data-testid="grid-panel-count"]')!.textContent).toBe("2건");
  });
});

describe("건수 배지", () => {
  it("걸러지면 「보이는 / 전체건」 으로 바뀌고 지우면 돌아온다", async () => {
    await show(gridEl({ title: "목록" }));
    await typeQuick("부품");
    expect(tid("grid-panel-filter-count")!.textContent).toBe("2 / 3건");
    expect(tid("grid-panel-count")).toBeNull();
    await click(tid("grid-quick-filter-clear"));
    await wait(30);
    expect(tid("grid-panel-filter-count")).toBeNull();
    expect(tid("grid-panel-count")!.textContent).toBe("3건");
  });
});

describe("걸린 조건 칩", () => {
  it("조건이 없으면 칩 줄 DOM 이 없다", async () => {
    await show(gridEl({ filter: true }));
    expect(tid("grid-filter-chips")).toBeNull();
    expect(document.querySelector(".grid-filter-chips")).toBeNull();
    await reset();
    await show(panel(gridEl({ filter: true })));
    expect(document.querySelector(".grid-filter-chips")).toBeNull();
  });

  for (const [label, wrap] of [
    ["GridPanel 밖(스스로 그리는 머리줄)", (el: ReactElement) => el],
    ["GridPanel 안", panel],
  ] as const) {
    it(`${label}: 검색어·칸별 조건이 칩으로 보이고, × 는 그 조건만 지운다`, async () => {
      await show(wrap(gridEl({ filter: true })));
      await typeQuick("창고");
      expect(chipTexts()).toEqual(["검색어 창고"]);
      await setQtyFilter({ filterType: "number", type: "greaterThan", filter: 500 });
      expect(chipTexts()).toEqual(["검색어 창고", "수량: > 500"]);
      expect(tid("grid-filter-chips")!.getAttribute("aria-label")).toBe("걸린 조건");
      expect(api().getDisplayedRowCount()).toBe(1);

      // 칸별 조건 칩의 × — 그 칸의 필터만 지운다(검색어는 그대로)
      await click(tids("grid-filter-chip-clear")[1]!);
      await wait(60);
      expect(api().getFilterModel()).toEqual({});
      expect(chipTexts()).toEqual(["검색어 창고"]);
      expect(api().getDisplayedRowCount()).toBe(2);
      expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("창고");

      // 검색어 칩의 × — 검색 칸 입력도 비고 칩 줄이 사라진다
      await click(tids("grid-filter-chip-clear")[0]!);
      await wait(60);
      expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
      expect(api().getGridOption("quickFilterText")).toBe("");
      expect(api().getDisplayedRowCount()).toBe(3);
      expect(tid("grid-filter-chips")).toBeNull();
    });
  }

  it("검색어 칩을 지울 때 칸별 조건은 남는다", async () => {
    await show(gridEl({ filter: true }));
    await setQtyFilter({ filterType: "number", type: "lessThan", filter: 1000 });
    await typeQuick("부품");
    expect(chipTexts()).toEqual(["검색어 부품", "수량: < 1000"]);
    await click(tids("grid-filter-chip-clear")[0]!);
    await wait(60);
    expect(chipTexts()).toEqual(["수량: < 1000"]);
    expect(api().getDisplayedRowCount()).toBe(2);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
  });

  it("건수가 같아도 조건이 바뀌면 칩이 바뀐다(검색어 부품 → 창고)", async () => {
    await show(gridEl());
    await typeQuick("부품");
    expect(api().getDisplayedRowCount()).toBe(2);
    expect(chipTexts()).toEqual(["검색어 부품"]);
    await typeQuick("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
    expect(chipTexts()).toEqual(["검색어 창고"]);
  });

  it("칸 이름은 머리글 표시 이름이고, 조건 2개 조합은 「A 그리고 B」 로 쓴다", async () => {
    await show(gridEl({ filter: true }));
    await setQtyFilter({
      filterType: "number",
      operator: "AND",
      conditions: [
        { filterType: "number", type: "greaterThan", filter: 100 },
        { filterType: "number", type: "lessThan", filter: 2000 },
      ],
    });
    expect(chipTexts()).toEqual(["수량: > 100 그리고 < 2000"]);
    await click(tid("grid-filter-chip-clear"));
    await wait(60);
    expect(tid("grid-filter-chips")).toBeNull();
    await act(async () => {
      await api().setColumnFilterModel("name", { filterType: "text", type: "contains", filter: "창고" });
      api().onFilterChanged();
    });
    await wait(30);
    expect(chipTexts()).toEqual(["이름: 창고"]);
  });

  it("칩은 Mantine 이 아니라 grid.css 의 토큰 CSS 이고 색은 의미 토큰만 쓴다", () => {
    const css = readFileSync("src/components/grid/grid.css", "utf8");
    const start = css.indexOf(".grid-filter-chips {");
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\brgba?\(/);
    expect(block).toMatch(/\.grid-filter-chip \{[^}]*var\(--color-/);
  });
});

describe("describeFilterModel — 필터 모델 짧게 쓰기", () => {
  it("글자 필터", () => {
    expect(describeFilterModel({ filterType: "text", type: "contains", filter: "RAW" })).toBe("RAW");
    expect(describeFilterModel({ filterType: "text", type: "equals", filter: "RAW" })).toBe("= RAW");
    expect(describeFilterModel({ filterType: "text", type: "notEqual", filter: "RAW" })).toBe("≠ RAW");
    expect(describeFilterModel({ filterType: "text", type: "startsWith", filter: "KR" })).toBe("KR 시작");
    expect(describeFilterModel({ filterType: "text", type: "endsWith", filter: "02" })).toBe("02 끝");
    expect(describeFilterModel({ filterType: "text", type: "notContains", filter: "X" })).toBe("포함 안 함 X");
    expect(describeFilterModel({ filterType: "text", type: "blank" })).toBe("빈 값");
    expect(describeFilterModel({ filterType: "text", type: "notBlank" })).toBe("값 있음");
  });
  it("숫자 필터와 범위", () => {
    expect(describeFilterModel({ filterType: "number", type: "equals", filter: 5 })).toBe("= 5");
    expect(describeFilterModel({ filterType: "number", type: "lessThanOrEqual", filter: 5 })).toBe("≤ 5");
    expect(describeFilterModel({ filterType: "number", type: "greaterThanOrEqual", filter: 5 })).toBe("≥ 5");
    expect(describeFilterModel({ filterType: "number", type: "inRange", filter: 1, filterTo: 9 })).toBe("1 ~ 9");
  });
  it("조건 2개 조합 — AND/OR, conditions 와 예전 condition1·condition2 모양", () => {
    const a = { filterType: "text", type: "contains", filter: "A" };
    const b = { filterType: "text", type: "contains", filter: "B" };
    expect(describeFilterModel({ filterType: "text", operator: "AND", conditions: [a, b] })).toBe("A 그리고 B");
    expect(describeFilterModel({ filterType: "text", operator: "OR", conditions: [a, b] })).toBe("A 또는 B");
    expect(describeFilterModel({ filterType: "text", operator: "OR", condition1: a, condition2: b })).toBe("A 또는 B");
  });
  it("알 수 없는 모양은 「적용됨」, 긴 값은 줄인다", () => {
    expect(describeFilterModel(null)).toBe("적용됨");
    expect(describeFilterModel({ filterType: "text", type: "contains" })).toBe("적용됨");
    expect(shortenChipValue("가".repeat(40))).toBe(`${"가".repeat(24)}…`);
    expect(shortenChipValue("짧다")).toBe("짧다");
  });
  it("buildFilterChips — 걸린 조건이 없으면 늘 같은 빈 목록", () => {
    expect(buildFilterChips(null, "")).toBe(buildFilterChips(null, "  "));
    expect(buildFilterChips(null, "KR02").map((c) => `${c.label} ${c.value}`)).toEqual(["검색어 KR02"]);
  });
});

describe("렌더 수·열 정의 — 머리줄을 달아도 header={false}(= 예전 동작)와 같다", () => {
  const scenarios: Array<[string, (props: Partial<AgDataGridProps>) => ReactElement, boolean]> = [
    ["GridPanel 밖 일반 그리드", (p) => gridEl({ title: "목록", ...p }), true],
    ["GridPanel 밖 height=auto 작은 목록", (p) => gridEl({ height: "auto", ...p }), true],
    ["대화 상자 안 그리드", (p) => dialog(gridEl(p)), false],
    ["GridPanel 안 그리드(header 는 무시된다)", (p) => panel(gridEl(p)), true],
  ];
  for (const [label, make, hasSearch] of scenarios) {
    it(`${label}: AgGridReact 렌더 수와 열 정의 키가 같고, 검색·조건·칩 조작은 그리드를 다시 그리지 않는다`, async () => {
      const measure = async (header: boolean) => {
        renderSpy.mockClear();
        await show(make({ header, filter: true }));
        const afterMount = renderSpy.mock.calls.length;
        const defs = (api().getColumnDefs() as ColDef[]).map((d) => Object.keys(d).sort());
        // header={false} 만 머리글 줄 설정 아이콘 자리(cm-grid-settings-on)를 갖는다 — 그 밖의 그리드 상자 클래스는 같아야 한다.
        const box = gridBox().className.replace(" cm-grid-settings-on", "");
        if (tid("grid-quick-filter-input")) await typeQuick("창고");
        await setQtyFilter({ filterType: "number", type: "greaterThan", filter: 500 });
        const chips = document.querySelectorAll(".grid-filter-chip").length;
        for (let left = chips; left > 0; left--) await click(tids("grid-filter-chip-clear")[0]!);
        await wait(60);
        const used = renderSpy.mock.calls.length - afterMount;
        const quick = !!tid("grid-quick-filter-input");
        await reset();
        return { afterMount, used, defs, box, chips, quick };
      };
      const head = await measure(true);
      const base = await measure(false);
      expect(head.afterMount).toBe(base.afterMount);
      expect(head.defs).toEqual(base.defs);
      expect(head.box).toBe(base.box);
      expect(head.used).toBe(0);
      expect(base.used).toBe(0);
      // 검색 칸은 GridPanel 안·스스로 그리는 머리줄에만 있다(header={false}·대화 상자 안은 없다). 칩 줄도 그 머리줄에만 있다.
      expect(head.quick).toBe(hasSearch);
      expect(head.chips).toBe(hasSearch ? 2 : 0);
      expect(base.quick).toBe(label.startsWith("GridPanel 안"));
    });
  }
});

describe("count — GridPanel count 와 같은 이름·뜻", () => {
  it("count 를 주면 건수 배지가 그 값을 보이고, 걸러지면 「보이는 / 받은 행 전체」 로 바뀌었다가 풀면 돌아온다", async () => {
    await show(gridEl({ title: "목록", count: 1234 }));
    expect(tid("grid-panel-count")!.textContent).toBe("1234건");
    await typeQuick("부품");
    // GridPanel 과 같다: 걸러진 동안은 count 가 아니라 그리드가 받은 행 기준 「보이는 / 전체」
    expect(tid("grid-panel-filter-count")!.textContent).toBe("2 / 3건");
    expect(tid("grid-panel-count")).toBeNull();
    await click(tid("grid-quick-filter-clear"));
    await wait(30);
    expect(tid("grid-panel-filter-count")).toBeNull();
    expect(tid("grid-panel-count")!.textContent).toBe("1234건");
  });

  it("count 를 주지 않으면 받은 행 수를 보인다(예전 그대로)", async () => {
    await show(gridEl({ title: "목록" }));
    expect(tid("grid-panel-count")!.textContent).toBe("3건");
  });

  it("GridPanel 의 걸러진 상태와 같은 표기다(GridPanel count=1234 / 그리드 count=1234)", async () => {
    await show(createElement(GridPanel, { title: "목록", count: 1234 }, gridEl()));
    await typeQuick("부품");
    const panelText = tid("grid-panel-filter-count")!.textContent;
    await reset();
    await show(gridEl({ title: "목록", count: 1234 }));
    await typeQuick("부품");
    expect(tid("grid-panel-filter-count")!.textContent).toBe(panelText);
  });

  it("count·titleExtra 가 바뀌어도 AgGridReact 는 다시 그려지지 않고 머리줄만 바뀐다", async () => {
    // MantineProvider 를 다시 그리면 Mantine 컨텍스트를 읽는 그리드가 어차피 다시 그려지므로, 그리드의 부모만 상태로 바꿔 다시 그린다.
    let setExtras!: (next: { count: number; label: string }) => void;
    function Harness() {
      const [x, set] = useState({ count: 10, label: "A" });
      setExtras = set;
      return gridEl({ title: "목록", count: x.count, titleExtra: createElement("i", { "data-testid": "extra" }, x.label) });
    }
    await show(createElement(Harness));
    expect(tid("grid-panel-count")!.textContent).toBe("10건");
    expect(tid("extra")!.textContent).toBe("A");
    const before = renderSpy.mock.calls.length;
    await act(async () => setExtras({ count: 99, label: "B" }));
    await act(async () => setExtras({ count: 99, label: "C" })); // count 는 같고 titleExtra 요소만 새로
    await act(async () => setExtras({ count: 100, label: "C" })); // titleExtra 요소만 새로(내용 같음)
    expect(tid("grid-panel-count")!.textContent).toBe("100건");
    expect(tid("extra")!.textContent).toBe("C");
    expect(renderSpy.mock.calls.length).toBe(before);
  });
});

describe("titleExtra — GridPanel titleExtra 와 같은 자리(제목·건수 옆)", () => {
  const extra = () => createElement("span", { "data-testid": "extra" }, "최대 100건");
  const orderInTitle = () => [...tid("extra")!.parentElement!.children].map((el) => el.getAttribute("data-testid"));

  it("제목 → 건수 배지 → titleExtra 순서로 .grid-panel-title 안에 놓이고, GridPanel 의 titleExtra 와 같은 순서다", async () => {
    await show(gridEl({ title: "목록", titleExtra: extra() }));
    const own = orderInTitle();
    expect(own).toEqual(["grid-panel-title", "grid-panel-count", "extra"]);
    expect(tid("extra")!.parentElement!.classList.contains("grid-panel-title")).toBe(true);
    await reset();
    await show(createElement(GridPanel, { title: "목록", count: 3, titleExtra: extra() }, gridEl()));
    expect(orderInTitle()).toEqual(own);
  });

  it("title 이 없어도 건수 배지 옆에 놓인다", async () => {
    await show(gridEl({ titleExtra: extra() }));
    expect(orderInTitle()).toEqual(["grid-panel-count", "extra"]);
  });
});

describe("접근성 이름", () => {
  const gridLabel = () => gridBox().getAttribute("aria-label");
  const searchLabel = () => tid("grid-quick-filter-input")!.getAttribute("aria-label");

  it("그리드 aria-label 기본값은 문자열 title 이고, ariaLabel 이 있으면 그것이 먼저며, title 이 없거나 요소면 「데이터 목록」", async () => {
    await show(gridEl({ title: "항목 목록" }));
    expect(gridLabel()).toBe("항목 목록");
    await reset();
    await show(gridEl({ title: "항목 목록", ariaLabel: "직접 지정" }));
    expect(gridLabel()).toBe("직접 지정");
    await reset();
    await show(gridEl());
    expect(gridLabel()).toBe("데이터 목록");
    await reset();
    await show(gridEl({ title: createElement("b", null, "요소 제목") }));
    expect(gridLabel()).toBe("데이터 목록");
  });

  it("빠른 검색 칸 이름에 그리드명이 들어가 한 화면의 검색 칸이 구별된다 — 이름이 없으면 기본 문구", async () => {
    await show(createElement("div", null, gridEl({ title: "항목 목록" }), gridEl({ title: "버전 이력" }), gridEl()));
    const labels = [...document.querySelectorAll<HTMLElement>('[data-testid="grid-quick-filter-input"]')].map((el) => el.getAttribute("aria-label"));
    expect(labels).toEqual(["항목 목록 그리드에서 찾기", "버전 이력 그리드에서 찾기", "그리드에서 찾기"]);
    expect(new Set(labels).size).toBe(3);
  });

  it("GridPanel 머리줄의 검색 칸도 GridPanel title 이 이름에 들어간다", async () => {
    await show(panel(gridEl()));
    expect(searchLabel()).toBe("목록 그리드에서 찾기");
  });
});

describe("칩 × 뒤 포커스", () => {
  const clears = () => tids("grid-filter-chip-clear");
  /** 실제 사용처럼 × 에 포커스를 둔 채 누른다(포커스를 쥔 칩이 사라지면 브라우저는 body 로 보낸다). */
  async function pressClear(i: number) {
    const btn = clears()[i]!;
    btn.focus();
    await click(btn);
    await wait(60);
  }
  async function threeChips() {
    await show(gridEl({ filter: true }));
    await typeQuick("창고");
    await setQtyFilter({ filterType: "number", type: "greaterThan", filter: 100 });
    await act(async () => {
      await api().setColumnFilterModel("name", { filterType: "text", type: "contains", filter: "창고" });
      api().onFilterChanged();
    });
    await wait(30);
    expect(chipTexts().length).toBe(3);
  }

  it("가운데 칩을 지우면 다음 칩의 ×, 마지막 칩을 지우면 앞 칩의 ×로 간다", async () => {
    await threeChips();
    await pressClear(1);
    expect(chipTexts().length).toBe(2);
    expect(document.activeElement).toBe(clears()[1]); // 가운데가 사라지고 마지막 칩이 그 자리
    await pressClear(1); // 마지막 칩
    expect(chipTexts().length).toBe(1);
    expect(document.activeElement).toBe(clears()[0]);
  });

  it("첫 칩을 지우면 다음 칩의 ×로 간다", async () => {
    await threeChips();
    await pressClear(0);
    expect(chipTexts().length).toBe(2);
    expect(document.activeElement).toBe(clears()[0]);
  });

  it("마지막 칩을 지우면 빠른 검색 입력 칸으로 간다(포커스가 body 로 빠지지 않는다)", async () => {
    await show(gridEl({ filter: true }));
    await setQtyFilter({ filterType: "number", type: "greaterThan", filter: 100 });
    expect(chipTexts().length).toBe(1);
    await pressClear(0);
    expect(tid("grid-filter-chips")).toBeNull();
    expect(document.activeElement).toBe(tid("grid-quick-filter-input"));
  });

  it("검색어 칩이 마지막이었어도(검색 칸이 다시 마운트돼도) 새 검색 입력 칸으로 간다", async () => {
    await show(gridEl({ filter: true }));
    await typeQuick("창고");
    expect(chipTexts()).toEqual(["검색어 창고"]);
    await pressClear(0);
    expect(tid("grid-filter-chips")).toBeNull();
    expect(document.activeElement).toBe(tid("grid-quick-filter-input"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("GridPanel 안에서도 같다", async () => {
    await show(panel(gridEl({ filter: true })));
    await setQtyFilter({ filterType: "number", type: "greaterThan", filter: 100 });
    await pressClear(0);
    expect(document.activeElement).toBe(tid("grid-quick-filter-input"));
  });

  it("사용자가 그 사이 다른 곳에 포커스를 두었으면 빼앗지 않는다", async () => {
    await threeChips();
    const other = document.createElement("button");
    document.body.appendChild(other);
    clears()[0]!.focus();
    other.focus();
    await click(clears()[0]!);
    await wait(60);
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("검색 칸이 없는 머리줄은 칩이 다 사라지면 getFocusFallback(그리드 상자)으로 간다", async () => {
    let chips: readonly GridFilterChip[] = [{ id: "col:qty", kind: "column", label: "수량", value: "> 5", title: "수량 > 5" }];
    const listeners = new Set<() => void>();
    const controls: GridPanelGridControls = {
      subscribeFilter: (l) => (listeners.add(l), () => void listeners.delete(l)),
      getFilterChips: () => chips,
      clearFilterChip: () => {
        chips = [];
        listeners.forEach((l) => l());
      },
    };
    const gridLike = document.createElement("div");
    gridLike.tabIndex = -1;
    document.body.appendChild(gridLike);
    await show(createElement(GridFilterChips, { controls, getFocusFallback: () => gridLike }));
    clears()[0]!.focus();
    await click(clears()[0]!);
    await wait(30);
    expect(tid("grid-filter-chips")).toBeNull();
    expect(document.activeElement).toBe(gridLike);
    gridLike.remove();
  });
});

describe("머리줄 CSS — 문자열 검사", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  /** 선택자 목록(쉼표 분리)과 본문으로 나눈 규칙들. 주석은 먼저 뺀다. */
  function rules(css: string): Array<{ selectors: string[]; body: string }> {
    const out: Array<{ selectors: string[]; body: string }> = [];
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selectors: m[1]!.split(",").map((x) => x.trim().replace(/\s+/g, " ")), body: m[2]! });
    }
    return out;
  }

  it("modal.css·grid.css 의 제목 글꼴 규칙은 건수 배지(.grid-panel-count)에 닿지 않는다 — 제목 없는 머리줄", () => {
    for (const file of ["src/components/modal.css", "src/components/grid/grid.css"]) {
      const titleRules = rules(read(file))
        .flatMap((r) => r.selectors)
        .filter((sel) => /\.grid-panel-title\s*>\s*span:first-child/.test(sel));
      expect(titleRules.length, file).toBeGreaterThan(0);
      for (const sel of titleRules) expect(sel, file).toContain(":not(.grid-panel-count)");
    }
  });

  it("부모를 채우는 바깥 상자(.cm-grid-with-header)에도 .form-panel·.cm-modal-body 안 바닥선 1px 상한이 걸리고, 숫자·auto 바깥 상자에는 걸리지 않는다", () => {
    const fill = (scope: string) => `${scope} .cm-grid-with-header:not(.cm-grid-with-header--sized):not(.cm-grid-with-header--auto)`;
    const hit = rules(read("src/components/grid/grid.css")).find(
      (r) => r.selectors.includes(fill(".cm-modal-body")) && r.selectors.includes(fill(".form-panel")),
    );
    expect(hit?.body).toMatch(/max-height:\s*calc\(100% - 1px\)/);
    // 걸 필요 없는(내용 높이) 바깥 상자에 거는 규칙은 없다 — 고정 높이 래퍼 안에서 1px 잘림
    for (const r of rules(read("src/components/grid/grid.css"))) {
      for (const sel of r.selectors) {
        if (/\.cm-grid-with-header(--sized|--auto)?$/.test(sel) && sel.includes(".cm-modal-body")) expect(r.body, sel).not.toMatch(/max-height:\s*calc/);
      }
    }
  });

  it("좁은 폭 — 검색 칸만 줄어들고(min-width 작게, flex 줄어듦) 단추 묶음·설정 메뉴 칸은 줄지 않으며 제목은 말줄임이다", () => {
    const css = rules(read("src/components/grid/grid.css"));
    const body = (sel: string) => css.find((r) => r.selectors.includes(sel))?.body ?? "";
    expect(body(".grid-quick-filter")).toMatch(/flex:\s*0 1 auto/);
    expect(body(".grid-quick-filter")).toMatch(/min-width:\s*\d+px/);
    expect(body(".grid-quick-filter-input")).toMatch(/min-width:\s*0/);
    expect(body(".grid-panel-header-actions")).not.toMatch(/flex-shrink:\s*0/);
    expect(body(".grid-panel-header-actions")).toMatch(/min-width:\s*0/);
    expect(body(".grid-panel-settings-slot")).toMatch(/flex-shrink:\s*0/);
    expect(body(".grid-panel-header-actions > .grid-panel-buttons")).toMatch(/flex-shrink:\s*0/);
    const title = css.find((r) => r.selectors.some((x) => x.startsWith(".grid-panel-title > span:first-child")))?.body ?? "";
    expect(title).toMatch(/text-overflow:\s*ellipsis/);
    expect(title).toMatch(/overflow:\s*hidden/);
    // 업무 화면 레이아웃(.page-layout)의 단추 묶음도 줄어들 수 있어야 검색 칸이 줄어든다
    const layout = rules(read("src/layout/page-layout.css")).find((r) => r.selectors.includes(".page-layout .grid-panel-header-actions"));
    expect(layout?.body).not.toMatch(/flex-shrink:\s*0/);
    // .page-layout 의 제목도 아주 좁으면 줄어든다(60% 상한 + 말줄임) — 설정 메뉴 칸이 밀려 잘리지 않게
    const layoutTitle = rules(read("src/layout/page-layout.css")).find((r) => r.selectors.includes(".page-layout .grid-panel-title"));
    expect(layoutTitle?.body).toMatch(/flex:\s*0 1 auto/);
    expect(layoutTitle?.body).toMatch(/min-width:\s*0/);
  });

  it("GRID_HEADER_HEIGHT 는 34 이고 grid 모듈 index 에서 내보내며 grid.css·상수 파일이 서로를 가리킨다", () => {
    expect(GRID_HEADER_HEIGHT).toBe(34);
    expect(read("src/components/grid/index.ts")).toContain('export { GRID_HEADER_HEIGHT } from "./grid-header-height"');
    expect(read("src/components/grid/grid-header-height.ts")).toContain("grid.css");
    expect(read("src/components/grid/grid.css")).toContain("GRID_HEADER_HEIGHT");
  });
});
