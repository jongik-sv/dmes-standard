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
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { GRID_QUICK_FILTER_DEBOUNCE_MS } from "../../src/components/grid/GridQuickFilter";
import { buildFilterChips, describeFilterModel, shortenChipValue } from "../../src/components/grid/grid-filter-chips";
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
    expect(frame.style.height).toBe("300px");
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

  it("excelExport 를 주면 아래 줄 [엑셀] 단추는 머리줄 메뉴가 맡고(단추 없음) 「N행」 줄은 남는다", async () => {
    await show(gridEl({ excelExport: {} }));
    expect(tid("grid-with-header")!.style.height).toBe("300px");
    expect(tid("grid-excel-frame")!.style.flex).toContain("1 1 0");
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
