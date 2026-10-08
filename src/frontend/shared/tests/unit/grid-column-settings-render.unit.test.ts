/** @vitest-environment happy-dom */
/**
 * 컬럼 설정 창·헤더 우클릭 메뉴·GridPanel 「그리드 설정」 메뉴의 [컬럼 설정…](C3) — 실제 ag-grid·MantineProvider 로 그려 확인한다.
 * 그리드 api 는 AgGridReact.render 의 this 로 잡는다(grid-personalize-render 시험과 같은 방식).
 */
import { act, createElement, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel, type GridPanelProps } from "../../src/components/grid/GridPanel";
import { gridPrefKey, type GridPrefs } from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS } from "../../src/components/grid/grid-personalize-hook";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-cs";
const KEY = gridPrefKey("u1", SCREEN, "main");
const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
  { key: "secret", header: "내부", hide: true },
];
const DATA = [
  { code: "A", name: "가", qty: 1, secret: "x" },
  { code: "B", name: "나", qty: 2, secret: "y" },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

async function stubUser(user: string | null) {
  if (user) await seedCurrentUser(user);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`그리드가 요청을 보냈다: ${String(input)}`);
    }),
  );
}
const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

function gridEl(props: Partial<AgDataGridProps> = {}, key?: string) {
  return createElement(AgDataGrid, {
    key,
    columns: COLUMNS,
    rowKey: "code",
    data: DATA,
    columnSizing: "fixed",
    height: "auto",
    // 엑셀 출력은 GridPanel 안에서 기본 켬이라 메뉴가 늘 생긴다. 이 파일은 개인화 항목만 보므로 엑셀은 끈다(엑셀은 grid-settings-menu-excel 시험).
    excelExport: false,
    ...props,
  });
}
function tab(...children: ReactElement[]) {
  return createElement(TabPageContext.Provider, { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } }, ...children);
}
function panel(children: ReactElement | null, props: Partial<GridPanelProps> = {}, key?: string) {
  return createElement(GridPanel, { key, title: "목록", ...props }, children);
}
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}

function apis(): GridApi[] {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed());
}
const api = (i = 0) => apis()[i];
const order = (a: GridApi) => a.getAllGridColumns().map((c) => c.getColId());
const visible = (a: GridApi) => a.getAllGridColumns().filter((c) => c.isVisible()).map((c) => c.getColId());
function saved(key = KEY): GridPrefs | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as GridPrefs) : null;
}
function seed(prefs: Omit<GridPrefs, "v" | "savedAt">, key = KEY) {
  localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: 1, ...prefs }));
}

const byId = (id: string) => document.getElementById(id);
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
/** GridPanel 「그리드 설정」 메뉴 열기 단추 — 개인화가 켜진 그리드가 있을 때만 있다(예전 [컬럼 설정] 단추의 있고 없음을 대신 본다). */
const settingsMenuButton = () => tid("grid-settings-menu");
/** 메뉴를 열고(이미 열려 있으면 그대로) 항목 하나를 돌려준다. 항목은 메뉴가 열린 동안에만 DOM 에 있다. */
async function menuItem(id: string) {
  const t = settingsMenuButton()!;
  if (t.getAttribute("aria-expanded") !== "true") {
    await act(async () => void t.click());
    await wait(60);
  }
  return byId(id);
}
const settingsRows = () =>
  Array.from(document.querySelectorAll('[data-testid^="column-settings-row-"]')).map((e) =>
    e.getAttribute("data-testid")!.replace("column-settings-row-", ""),
  );
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
/** 초기화 확인 창(MessageModal confirm)의 단추를 누른다. */
const confirmButton = (text: "확인" | "취소") => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text) ?? null;

/** 머리글 칸·데이터 칸에 우클릭(contextmenu)을 보낸다. 기본 동작이 막혔는지(defaultPrevented)를 돌려준다. */
function rightClick(el: Element, x = 40, y = 30): boolean {
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y });
  act(() => void el.dispatchEvent(ev));
  return ev.defaultPrevented;
}
const headerCell = (colId: string) => document.querySelector(`.ag-header-cell[col-id="${colId}"]`)!;
const dataCell = (colId: string) => document.querySelector(`.ag-cell[col-id="${colId}"]`)!;

beforeEach(() => {
  localStorage.clear();
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  const g = globalThis as Record<string, unknown>;
  delete g.__dkOasisGridPersonalizeRegistry__;
});

describe("GridPanel 「그리드 설정」 메뉴의 [컬럼 설정…]", () => {
  it("개인화가 켜진 그리드가 있으면 보이고, 누르면 컬럼 설정 창이 열린다 — 내부 컬럼은 목록에 없다", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl())));
    const icon = settingsMenuButton()!;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute("aria-label")).toBe("그리드 설정");
    expect(icon.closest(".grid-panel-settings-slot")).not.toBeNull(); // 머리줄 맨 끝 칸
    const b = (await menuItem("btn_grid_columns")) as HTMLButtonElement;
    expect(b.textContent).toBe("컬럼 설정…");
    expect(tid("grid-columns-button")).toBe(b);
    expect(tid("column-settings")).toBeNull();
    await click(b);
    expect(tid("column-settings")).not.toBeNull();
    expect(settingsRows()).toEqual(["code", "name", "qty"]);
    // 행 키(code)는 숨길 수 없다
    expect(tid("column-settings-check-code")!.getAttribute("title")).toBe("숨길 수 없는 컬럼");
  });

  it("usePermission 이어도·loading 이어도 늘 활성이다(권한 검사를 거치지 않는다)", async () => {
    await stubUser("u1");
    const fetchPermissions = vi.fn(async () => [] as string[]);
    await show(tab(panel(gridEl(), { usePermission: true, fetchPermissions, loading: true, buttons: [{ id: "btn_x", label: "저장" }] })));
    expect((byId("btn_x") as HTMLButtonElement).disabled).toBe(true);
    const icon = settingsMenuButton() as HTMLButtonElement;
    expect(icon.disabled).toBe(false);
    const b = (await menuItem("btn_grid_columns")) as HTMLButtonElement;
    expect(b.hasAttribute("disabled")).toBe(false);
    await click(b);
    expect(tid("column-settings")).not.toBeNull();
  });

  it("업무 버튼 → headerExtra → 설정 아이콘 순서로 아이콘이 머리줄 맨 끝에 하나만 놓인다", async () => {
    await stubUser("u1");
    await show(
      tab(
        panel(gridEl(), {
          showAddButton: true,
          buttons: [{ id: "btn_x", label: "저장" }],
          headerExtra: createElement("i", { id: "extra" }),
        }),
      ),
    );
    const ids = Array.from(document.querySelectorAll(".grid-panel-buttons button")).map((e) => e.getAttribute("data-testid") ?? e.id);
    expect(ids).toEqual(["btn_grid_add", "btn_x"]);
    const actions = document.querySelector(".grid-panel-header-actions")!;
    expect(Array.from(actions.children).map((e) => e.className)).toEqual([
      "grid-quick-filter", // 빠른 검색 칸은 기본으로 보이고 업무 버튼 앞에 놓인다
      "grid-panel-buttons",
      "grid-panel-header-extra",
      "grid-panel-settings-slot",
    ]);
    expect(actions.lastElementChild!.querySelector('[data-testid="grid-settings-menu"]')).not.toBeNull();
  });

  it("개인화를 끈 그리드·그리드 없음이면 단추가 없고 머리 DOM 이 같다", async () => {
    await stubUser("u1");
    const headerHtml = () => document.querySelector(".grid-panel-header")!.outerHTML;
    await show(tab(panel(null)));
    const none = headerHtml();
    expect(document.querySelector(".grid-panel-header-actions")).toBeNull();
    // 개인화를 끈 그리드는 [컬럼 원래대로] 때문에 메뉴가 생기므로, 메뉴가 전혀 없는 모양은 settingsMenu={false} 로 본다
    await show(tab(panel(gridEl({ personalize: false, filter: false, settingsMenu: false }))));
    expect(settingsMenuButton()).toBeNull();
    expect(headerHtml()).toBe(none);
    // 버튼이 있는 패널도 그리드 켬 → 끔 사이 DOM 이 달라지는 것은 단추 하나뿐
    await show(tab(panel(gridEl({ personalize: false, filter: false, settingsMenu: false }), { buttons: [{ id: "btn_x", label: "저장" }] })));
    const withBtn = headerHtml();
    expect(withBtn).not.toContain("grid-settings-menu");
  });

  it("그리드가 사라지면(언마운트) 단추도 사라진다", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl())));
    expect(settingsMenuButton()).not.toBeNull();
    await show(tab(panel(null)));
    expect(settingsMenuButton()).toBeNull();
    expect(document.querySelector(".grid-panel-header-actions")).toBeNull();
  });

  it("사용자 확인 전에는 없다가 확인되면 나타난다", async () => {
    await stubUser(null);
    // 사용자 확인 전에는 개인화가 꺼져 있어 [컬럼 원래대로] 가 보이고 [컬럼 설정…] 은 없다. 확인되면 서로 바뀐다
    await show(tab(panel(gridEl({ filter: false }))));
    expect(await menuItem("btn_grid_columns")).toBeNull();
    expect(document.getElementById("btn_grid_columns_reset")).not.toBeNull();
    await seedCurrentUser("u1");
    await wait(50);
    expect(await menuItem("btn_grid_columns")).not.toBeNull();
    expect(document.getElementById("btn_grid_columns_reset")).toBeNull();
  });

  it("GridPanel 안에 그리드가 여럿이면 처음 등록한 그리드가 대상이고, 그 그리드가 빠지면 다음 그리드가 이어받는다", async () => {
    await stubUser("u1");
    const colsB: GridColumn[] = [
      { key: "bcode", header: "비코드" },
      { key: "bname", header: "비이름" },
    ];
    const two = (withA: boolean) =>
      tab(
        panel(
          createElement(
            "div",
            null,
            withA ? gridEl({ gridId: "ga" }, "A") : null,
            gridEl({ gridId: "gb", columns: colsB, data: [{ bcode: "1", bname: "x" }], rowKey: "bcode" }, "B"),
          ),
        ),
      );
    await show(two(true));
    await click(await menuItem("btn_grid_columns"));
    expect(settingsRows()).toEqual(["code", "name", "qty"]);
    await click(tid("column-settings-cancel"));
    expect(tid("column-settings")).toBeNull();
    await show(two(false));
    expect(settingsMenuButton()).not.toBeNull();
    await click(await menuItem("btn_grid_columns"));
    expect(settingsRows()).toEqual(["bcode", "bname"]);
  });

  it("패널 안에서 포털로 띄운 그리드(룩업 등)는 바깥 패널에 등록되지 않는다 — 개인화를 끈 패널의 머리줄에 단추가 생기지 않는다", async () => {
    await stubUser("u1");
    const portaled = createPortal(gridEl({ gridId: "popup" }), document.body);
    await show(tab(panel(createElement("div", null, gridEl({ personalize: false, filter: false, settingsMenu: false }), portaled))));
    expect(apis()).toHaveLength(2);
    expect(document.querySelector(".grid-panel-header [data-testid='grid-settings-menu']")).toBeNull();
    // 포털로 밖에 나간 그리드는 GridPanel 밖 그리드라서 자기 머리글 줄 아이콘을 단다
    expect(document.querySelectorAll("[data-testid='grid-settings-overlay']")).toHaveLength(1);
  });

  it("대화 상자 안의 GridPanel·그리드는 등록하지 않는다(설정 창을 겹쳐 띄우지 않는다)", async () => {
    await stubUser("u1");
    await show(tab(createElement("div", { role: "dialog" }, panel(gridEl()))));
    expect(api().getAllGridColumns().length).toBeGreaterThan(0);
    expect(settingsMenuButton()).toBeNull();
  });

  it("GridPanel 없이 쓰는 그리드는 등록할 곳이 없어 자기 머리글 줄 아이콘으로 같은 메뉴를 단다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    expect(document.querySelector(".grid-panel-header")).toBeNull();
    expect(settingsMenuButton()!.closest("[data-testid='grid-settings-overlay']")).not.toBeNull();
    expect(api().getAllGridColumns().length).toBeGreaterThan(0);
  });
});

describe("머리글 우클릭 메뉴", () => {
  it("머리글이면 브라우저 기본 메뉴를 막고 메뉴를 띄운다 — 셀이면 메뉴 없이 기본 동작을 둔다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    expect(rightClick(dataCell("name"))).toBe(false);
    expect(tid("grid-header-menu")).toBeNull();
    expect(rightClick(headerCell("name"))).toBe(true);
    await wait(50);
    expect(tid("grid-header-menu")).not.toBeNull();
    expect(tid("grid-header-menu-settings")!.textContent).toBe("컬럼 설정…");
    expect(tid("grid-header-menu-autosave")!.textContent).toBe("자동 설정 저장");
    expect(tid("grid-header-menu-reset")!.textContent).toBe("설정 초기화…");
  });

  it("마우스 위치에 띄운다 — 기준 요소가 클릭 좌표의 고정 위치이고 다시 우클릭하면 새 위치로 옮긴다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    rightClick(headerCell("name"), 111, 22);
    await wait(50);
    const anchors = () => Array.from(document.body.querySelectorAll<HTMLElement>('body > span[style*="position: fixed"]'));
    expect(anchors()).toHaveLength(1);
    expect(anchors()[0].style.left).toBe("111px");
    expect(anchors()[0].style.top).toBe("22px");
    rightClick(headerCell("qty"), 200, 44);
    await wait(50);
    expect(anchors()).toHaveLength(1);
    expect(anchors()[0].style.left).toBe("200px");
    expect(anchors()[0].style.top).toBe("44px");
    expect(document.querySelectorAll('[data-testid="grid-header-menu"]')).toHaveLength(1);
  });

  it("대화 상자 안의 그리드는 머리글 우클릭 메뉴를 띄우지 않고 기본 동작을 둔다(룩업 창 위에 설정 창이 겹치지 않게)", async () => {
    await stubUser("u1");
    await show(tab(createElement("div", { role: "dialog" }, gridEl())));
    expect(rightClick(headerCell("name"))).toBe(false);
    await wait(50);
    expect(tid("grid-header-menu")).toBeNull();
  });

  it("개인화를 끈 그리드는 머리글 우클릭도 예전처럼 둔다", async () => {
    await stubUser("u1");
    await show(tab(gridEl({ personalize: false })));
    expect(rightClick(headerCell("name"))).toBe(false);
    await wait(50);
    expect(tid("grid-header-menu")).toBeNull();
  });

  it("Esc 로 닫힌다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    rightClick(headerCell("name"));
    await wait(50);
    expect(tid("grid-header-menu")).not.toBeNull();
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await wait(400);
    expect(tid("grid-header-menu")).toBeNull();
  });

  it("바깥을 누르면 닫힌다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    rightClick(headerCell("name"));
    await wait(50);
    expect(tid("grid-header-menu")).not.toBeNull();
    await act(async () => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
    await wait(400);
    expect(tid("grid-header-menu")).toBeNull();
  });

  it("[초기화] 는 확인 창을 거쳐 저장값을 지우고 정의 상태로 되돌린다", async () => {
    await stubUser("u1");
    seed({
      cols: [
        { colId: "qty", width: 210, hide: false, pinned: null },
        { colId: "code", hide: false, pinned: null },
        { colId: "name", hide: true, pinned: null },
      ],
    });
    await show(tab(gridEl()));
    const a = api();
    expect(order(a).filter((c) => c !== "secret")).toEqual(["qty", "code", "name"]);
    expect(a.getColumn("name")!.isVisible()).toBe(false);
    rightClick(headerCell("code"));
    await wait(50);
    await click(tid("grid-header-menu-reset"));
    await wait(50);
    // 확인 전에는 아무것도 바뀌지 않는다
    expect(tid("grid-reset-confirm")).not.toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(order(a).filter((c) => c !== "secret")).toEqual(["qty", "code", "name"]);
    await click(confirmButton("확인"));
    await wait(50);
    expect(tid("grid-reset-confirm")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(order(a)).toEqual(["code", "name", "qty", "secret"]);
    expect(visible(a)).toEqual(["code", "name", "qty"]);
    expect(a.getColumn("qty")!.getActualWidth()).toBe(90);
    await wait(400);
    expect(tid("grid-header-menu")).toBeNull();
  });

  it("[컬럼 설정] 은 설정 창을 연다", async () => {
    await stubUser("u1");
    await show(tab(gridEl()));
    rightClick(headerCell("code"));
    await wait(50);
    await click(tid("grid-header-menu-settings"));
    expect(tid("column-settings")).not.toBeNull();
    expect(settingsRows()).toEqual(["code", "name", "qty"]);
  });
});

describe("설정 창 적용 → 저장 → 복원", () => {
  it("적용하면 그리드에 반영되고 저장되며, 다시 마운트하면 복원된다 — 너비는 저장하지 않는다", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl())));
    const a = api();
    await click(await menuItem("btn_grid_columns"));
    // 수량을 맨 위로, 이름 숨김
    await click(tid("column-settings-up-qty"));
    await click(tid("column-settings-up-qty"));
    await click(tid("column-settings-check-name")!.querySelector("input"));
    await click(tid("column-settings-apply"));
    expect(tid("column-settings")).toBeNull();
    expect(order(a).filter((c) => c !== "secret")).toEqual(["qty", "code", "name"]);
    expect(visible(a)).toEqual(["qty", "code"]);
    const s = saved()!;
    expect(s.cols.map((c) => c.colId).filter((c) => c !== "secret")).toEqual(["qty", "code", "name"]);
    expect(s.cols.find((c) => c.colId === "name")!.hide).toBe(true);
    expect(s.cols.every((c) => c.width == null)).toBe(true);
    // 다시 마운트
    await act(async () => r!.unmount());
    r = null;
    await show(tab(panel(gridEl())));
    const b = api(apis().length - 1);
    expect(order(b).filter((c) => c !== "secret")).toEqual(["qty", "code", "name"]);
    expect(visible(b)).toEqual(["qty", "code"]);
    expect(b.getColumn("qty")!.getActualWidth()).toBe(90);
  });

  it("auto 그리드는 적용 뒤 자동 너비 맞춤을 다시 돌린다(숨긴 자리 빈 공간·다시 켠 컬럼 너비)", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl({ columnSizing: "auto" }))));
    const auto = vi.spyOn(api(), "autoSizeAllColumns");
    await click(await menuItem("btn_grid_columns"));
    await click(tid("column-settings-check-name")!.querySelector("input"));
    // 마운트 직후의 자동 너비 맞춤이 늦게 겹쳐 호출 수를 흔들지 않게, 적용 직전에 센 값을 비운다.
    auto.mockClear();
    await click(tid("column-settings-apply"));
    await wait(120);
    expect(auto).toHaveBeenCalledTimes(1);
  });

  it("선택 체크박스는 맨 앞에 남고 정의에서 숨긴 컬럼은 숨은 채 남는다", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl({ selectable: true, multiSelect: true }))));
    const a = api();
    const first = order(a)[0];
    expect(first).toBe("ag-Grid-SelectionColumn");
    await click(await menuItem("btn_grid_columns"));
    expect(settingsRows()).toEqual(["code", "name", "qty"]);
    await click(tid("column-settings-down-code"));
    await click(tid("column-settings-down-code"));
    await click(tid("column-settings-apply"));
    expect(order(a)[0]).toBe("ag-Grid-SelectionColumn");
    expect(order(a).filter((c) => c !== "secret" && c !== first)).toEqual(["name", "qty", "code"]);
    expect(a.getColumn("secret")!.isVisible()).toBe(false);
    expect(a.getColumn(first)!.isVisible()).toBe(true);
  });

  it("[기본값 복원] 단추는 저장값을 지운다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "qty", hide: false }, { colId: "code", hide: false }, { colId: "name", hide: true }] });
    await show(tab(panel(gridEl())));
    await click(await menuItem("btn_grid_columns"));
    await click(tid("column-settings-reset"));
    await wait(50);
    expect(tid("column-settings")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(visible(api())).toEqual(["code", "name", "qty"]);
  });
});

describe("머리글을 그리드 밖으로 끌어도 컬럼이 숨겨지지 않는다(suppressDragLeaveHidesColumns)", () => {
  it("개인화 여부와 상관없이 늘 true 다 — 개인화가 꺼진 그리드는 숨긴 칸을 되살릴 창이 없다", async () => {
    await stubUser("u1");
    await show(tab(gridEl({ gridId: "on" }, "on"), gridEl({ gridId: "off", personalize: false }, "off")));
    expect(api(0).getGridOption("suppressDragLeaveHidesColumns")).toBe(true);
    expect(api(1).getGridOption("suppressDragLeaveHidesColumns")).toBe(true);
  });

  it("사용자 확인 전(개인화가 아직 꺼진 동안)에도 true 다", async () => {
    await stubUser(null);
    await show(tab(gridEl()));
    expect(api().getGridOption("suppressDragLeaveHidesColumns")).toBe(true);
    await seedCurrentUser("u1");
    await wait(50);
    expect(api().getGridOption("suppressDragLeaveHidesColumns")).toBe(true);
  });

  it("자동 저장 대기 시간이 지나도 기본값 복원 뒤 저장값은 없다", async () => {
    await stubUser("u1");
    await show(tab(panel(gridEl())));
    await click(await menuItem("btn_grid_columns"));
    await click(tid("column-settings-reset"));
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(ls.getItem(KEY)).toBeNull();
  });
});
