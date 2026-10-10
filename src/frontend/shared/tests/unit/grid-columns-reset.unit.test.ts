/** @vitest-environment happy-dom */
/**
 * 개인화가 꺼진 그리드의 「그리드 설정」 [컬럼 원래대로] — 칸 순서·너비·숨김을 열 정의대로 되돌리고 정렬은 지킨다(저장 없음, 확인 없음).
 * 개인화 그리드에는 없다([설정 초기화…] 가 같은 일을 한다). 실제 ag-grid·MantineProvider 로 그린다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

installMemoryLocalStorage();

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "B", name: "나", qty: 2 },
  { code: "A", name: "가", qty: 1 },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());

function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, { columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", height: "auto", ...props });
}
const panel = (child: ReactElement) =>
  createElement(
    TabPageContext.Provider,
    { value: { pageId: "scr-reset", serviceId: "", tabId: "t1" } },
    createElement(GridPanel, { title: "목록" }, child),
  );
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
function api(): GridApi {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed())[0]!;
}
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
const menuLabels = () =>
  Array.from(document.querySelectorAll('[data-testid="grid-settings-dropdown"] > *')).map((el) =>
    el.getAttribute("role") === "separator" || el.classList.contains("mantine-Menu-divider") ? "|" : (el.textContent ?? "").trim(),
  ).filter((t) => t !== "");

beforeEach(async () => {
  localStorage.clear();
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("[컬럼 원래대로] — 개인화가 꺼진 그리드", () => {
  it("메뉴는 칸별 필터 보기 · 컬럼 원래대로 · (구분선) · 엑셀 출력 순서다", async () => {
    await show(panel(gridEl({ personalize: false })));
    await openMenu();
    expect(menuLabels()).toEqual(["칸별 필터 보기", "컬럼 원래대로", "|", "엑셀 출력"]);
  });

  it("누르면 확인 창 없이 순서·너비·숨김을 열 정의대로 되돌리고 정렬은 지키며, 아무것도 저장하지 않는다", async () => {
    await show(panel(gridEl({ personalize: false })));
    await act(async () => {
      api().moveColumns(["qty"], 0);
      api().setColumnWidths([{ key: "name", newWidth: 260 }]);
      api().setColumnsVisible(["code"], false);
      api().applyColumnState({ state: [{ colId: "qty", sort: "desc" }] });
    });
    const before = localStorage.length;
    await openMenu();
    await click(tid("grid-columns-reset-button"));
    await wait(60);
    const a = api();
    expect(a.getAllDisplayedColumns().map((c) => c.getColId())).toEqual(["code", "name", "qty"]);
    expect(a.getColumn("name")!.getActualWidth()).toBe(120);
    expect(a.getColumn("qty")!.getSort()).toBe("desc");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(localStorage.length).toBe(before);
  });
});

describe("[컬럼 원래대로] 가 없는 그리드", () => {
  it("GridPanel 밖에서 엑셀·개인화를 모두 끈 그리드는 [컬럼 원래대로] 하나 때문에 아이콘이 새로 생기지 않는다", async () => {
    await show(gridEl({ personalize: false, excelExport: false }));
    expect(tid("grid-settings-overlay")).toBeNull();
  });

  it("resetColumnsMenu={false} 면 [컬럼 원래대로] 만 빠지고 나머지 항목은 그대로이며, 생략하면 있다", async () => {
    await show(panel(gridEl({ personalize: false, resetColumnsMenu: false })));
    await openMenu();
    expect(tid("grid-columns-reset-button")).toBeNull();
    expect(menuLabels()).toEqual(["칸별 필터 보기", "|", "엑셀 출력"]);
    await show(panel(gridEl({ personalize: false })));
    expect(tid("grid-columns-reset-button")).not.toBeNull();
  });

  it("개인화가 켜진 그리드에는 없고 [설정 초기화…] 가 있다", async () => {
    await show(panel(gridEl({ gridId: "main" })));
    await openMenu();
    expect(tid("grid-columns-reset-button")).toBeNull();
    expect(tid("grid-reset-button")).not.toBeNull();
  });
});
