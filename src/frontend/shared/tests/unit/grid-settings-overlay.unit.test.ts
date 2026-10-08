/** @vitest-environment happy-dom */

// 「그리드 설정」 아이콘 — GridPanel 밖 그리드는 머리글 줄 오른쪽 끝의 아이콘(GridSettingsOverlay)으로 같은 메뉴를 단다.
// 항목·순서·testid 는 GridPanel 안과 같고, GridPanel 안 그리드는 아이콘을 따로 그리지 않는다(중복 없음). GridPanel 머리줄에서는 아이콘이 늘 맨 끝이다.
import { readFileSync } from "node:fs";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ exportToExcel: vi.fn() }));

vi.mock("../../src/utils/libExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libExcel")>()),
  exportToExcel: h.exportToExcel,
}));
vi.mock("../../src/utils/libDate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/libDate")>()),
  today: () => "20261006",
}));

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

installMemoryLocalStorage();

const COLUMNS: GridColumn[] = [
  { key: "woNo", header: "작업지시번호" },
  { key: "qty", header: "수량", type: "number" },
];
const DATA = [
  { woNo: "W-2", qty: 20 },
  { woNo: "W-1", qty: 10 },
];

let r: Rendered | null = null;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tids = (id: string) => document.querySelectorAll(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());

function page(child: ReactElement) {
  return createElement(TabPageContext.Provider, { value: { pageId: "scr-ov", serviceId: "", tabId: "t1" } }, child);
}
function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, {
    columns: COLUMNS,
    rowKey: "woNo",
    data: DATA,
    columnSizing: "fixed",
    height: "auto",
    gridId: "g",
    // 이 파일은 머리글 줄 설정 아이콘(header={false}, 머리줄 없는 그리드)을 시험한다. 머리줄이 있는 그리드는 grid-header 시험이 본다.
    header: false,
    ...props,
  });
}
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
function menuItems(): string[] {
  return [...tid("grid-settings-dropdown")!.children]
    .map((el) =>
      el.getAttribute("role") === "separator" || el.tagName === "HR" || el.classList.toString().includes("divider")
        ? "|"
        : (el.textContent ?? "").trim(),
    )
    .filter((t) => t !== "");
}

beforeEach(async () => {
  localStorage.clear();
  h.exportToExcel.mockReset();
  h.exportToExcel.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`그리드가 요청을 보냈다: ${String(input)}`);
    }),
  );
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("GridPanel 밖 그리드의 설정 아이콘", () => {
  it("그리드 안(머리글 줄 오른쪽 끝 겹침 자리)에 아이콘이 있고, 항목·순서가 GridPanel 안과 같다", async () => {
    await show(page(gridEl()));
    const overlay = tid("grid-settings-overlay")!;
    expect(overlay).not.toBeNull();
    const container = document.querySelector(".cm-data-grid")!;
    expect(container.contains(overlay)).toBe(true);
    expect(container.classList.contains("cm-grid-settings-on")).toBe(true); // 마지막 열 머리글 오른쪽 여백 규칙이 붙는 표지
    const icon = tid("grid-settings-menu")!;
    expect(overlay.contains(icon)).toBe(true);
    expect(icon.getAttribute("aria-label")).toBe("그리드 설정");
    await openMenu();
    expect(menuItems()).toEqual(["컬럼 설정…", "자동 설정 저장", "설정 초기화…", "|", "엑셀 출력"]);
    expect(tid("grid-columns-button")).not.toBeNull();
    expect(tid("grid-autosave-item")).not.toBeNull();
    expect(tid("grid-reset-button")).not.toBeNull();
  });

  it("엑셀 출력은 GridPanel 안과 같은 내보내기를 부른다(제목이 없으면 「목록」)", async () => {
    await show(page(gridEl()));
    await openMenu();
    await click(tid("grid-excel"));
    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
    const [rows, fileName] = h.exportToExcel.mock.calls[0] as [unknown[], string];
    expect(rows).toEqual(DATA);
    expect(fileName).toBe("목록_20261006.xlsx");
  });

  it("키보드로 닿는 단추이고 마우스·초점에 따라 진해지는 규칙이 CSS 에 있다", async () => {
    await show(page(gridEl()));
    const icon = tid("grid-settings-menu")!;
    expect(icon.tagName).toBe("BUTTON");
    expect(icon.getAttribute("tabindex")).not.toBe("-1");
    const css = readFileSync("src/components/grid/grid.css", "utf8");
    expect(css).toMatch(/\.cm-data-grid:hover > \.cm-grid-settings-overlay/);
    expect(css).toMatch(/\.cm-data-grid:focus-within > \.cm-grid-settings-overlay/);
    expect(css).toMatch(/\.cm-data-grid\.cm-grid-settings-on \.ag-header-cell\.ag-column-last,[^{]*\{\s*padding-right: 28px;/);
  });

  it("개인화가 없는(gridId·화면 없음, personalize={false}) 그리드는 [컬럼 원래대로] 와 엑셀 항목만 있다", async () => {
    await show(page(gridEl({ personalize: false })));
    await openMenu();
    expect(menuItems()).toEqual(["컬럼 원래대로", "|", "엑셀 출력"]);
    expect(tid("grid-columns-button")).toBeNull();
    expect(tid("grid-autosave-item")).toBeNull();
    expect(tid("grid-reset-button")).toBeNull();
  });

  it("항목이 하나도 없으면(개인화·엑셀 모두 끔) 아이콘을 그리지 않는다", async () => {
    await show(page(gridEl({ personalize: false, excelExport: false })));
    expect(tid("grid-settings-overlay")).toBeNull();
    expect(tid("grid-settings-menu")).toBeNull();
    expect(document.querySelector(".cm-data-grid")!.classList.contains("cm-grid-settings-on")).toBe(false);
  });

  it("settingsMenu={false} 면 개인화·엑셀이 켜져 있어도 아이콘이 없다", async () => {
    await show(page(gridEl({ settingsMenu: false })));
    expect(tid("grid-settings-overlay")).toBeNull();
    expect(tid("grid-settings-menu")).toBeNull();
  });

  it("행이 0 이면 엑셀 항목은 비활성이다", async () => {
    await show(page(gridEl({ data: [] })));
    await openMenu();
    expect(tid("grid-excel")!.hasAttribute("disabled")).toBe(true);
  });

  it("대화 상자 안의 그리드는 엑셀 항목만 있는 아이콘을 단다(설정 창이 겹쳐 Esc·Tab 이 꼬이지 않게 개인화 항목은 뺀다)", async () => {
    await show(page(createElement("div", { role: "dialog" }, gridEl())));
    expect(tid("grid-settings-overlay")).not.toBeNull();
    await openMenu();
    expect(menuItems()).toEqual(["엑셀 출력"]);
    await click(tid("grid-excel"));
    expect(h.exportToExcel).toHaveBeenCalledTimes(1);
  });

  it("대화 상자 안에서 excelExport={false} 면 항목이 없어 아이콘도 없다", async () => {
    await show(page(createElement("div", { role: "dialog" }, gridEl({ excelExport: false }))));
    expect(tid("grid-settings-overlay")).toBeNull();
  });

  it("MantineProvider 밖에서는 아이콘을 그리지 않고 그리드만 그린다(Mantine Menu 을 못 쓰는 자리에서 죽지 않는다)", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(page(gridEl()));
    });
    await wait(120);
    expect(document.querySelector(".ag-header-cell")).not.toBeNull();
    expect(tid("grid-settings-overlay")).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });

  it("컬럼 설정…을 누르면 설정 창이 열린다", async () => {
    await show(page(gridEl()));
    await openMenu();
    await click(tid("grid-columns-button"));
    await wait(60);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

describe("GridPanel 안 그리드는 아이콘이 하나뿐이다", () => {
  it("그리드 쪽 아이콘은 그리지 않고 GridPanel 머리줄 아이콘만 하나 있다", async () => {
    await show(page(createElement(GridPanel, { title: "목록" }, gridEl())));
    expect(tid("grid-settings-overlay")).toBeNull();
    expect(tids("grid-settings-menu").length).toBe(1);
    expect(tid("grid-panel-settings-slot")!.contains(tid("grid-settings-menu"))).toBe(true);
    expect(document.querySelector(".cm-data-grid")!.classList.contains("cm-grid-settings-on")).toBe(false);
  });

  it("GridPanel 안에서 settingsMenu={false} 인 그리드는 머리줄 메뉴도 만들지 않는다", async () => {
    await show(page(createElement(GridPanel, { title: "목록" }, gridEl({ settingsMenu: false }))));
    expect(tid("grid-settings-menu")).toBeNull();
    expect(tid("grid-panel-settings-slot")).toBeNull();
  });
});

describe("GridPanel 머리줄 순서 — 그리드 설정 아이콘이 늘 맨 끝", () => {
  it("업무 버튼 → headerExtra → 그리드 설정 아이콘 순서이고 아이콘 칸이 마지막 자식이다", async () => {
    await show(
      page(
        createElement(
          GridPanel,
          {
            title: "목록",
            buttons: [
              { id: "b1", label: "저장" },
              { id: "b2", label: "삭제" },
            ],
            headerExtra: createElement("button", { "data-testid": "extra", style: { order: 2147483647 } }, "최대화"),
          },
          gridEl(),
        ),
      ),
    );
    const actions = document.querySelector(".grid-panel-header-actions")!;
    const kids = [...actions.children].map((el) => el.className);
    // 빠른 검색 칸은 기본으로 보이고 업무 버튼 앞에 놓인다 — 설정 아이콘 칸이 마지막인 규칙은 그대로다.
    expect(kids).toEqual(["grid-quick-filter", "grid-panel-buttons", "grid-panel-header-extra", "grid-panel-settings-slot"]);
    const order = [...document.querySelectorAll("#b1, #b2, [data-testid='extra'], [data-testid='grid-settings-menu']")].map(
      (el) => el.getAttribute("data-testid") ?? el.id,
    );
    expect(order).toEqual(["b1", "b2", "extra", "grid-settings-menu"]);
  });

  it("아이콘 칸은 CSS order 최대값·margin-left:auto 로 고정돼 있다(화면이 order 를 줘도 앞서지 못한다)", () => {
    const css = readFileSync("src/components/grid/grid.css", "utf8");
    const block = css.match(/\.grid-panel-settings-slot \{([^}]*)\}/)?.[1] ?? "";
    expect(block).toMatch(/order:\s*2147483647/);
    expect(block).toMatch(/margin-left:\s*auto/);
  });
});
