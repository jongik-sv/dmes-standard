/** @vitest-environment happy-dom */
/**
 * 그리드 개인화 「자동 설정 저장」 스위치·「설정 초기화」(GridPanel 「그리드 설정」 메뉴 안) — 실제 ag-grid·MantineProvider 로 그려 확인한다.
 * 그리드 api 는 AgGridReact.render 의 this 로 잡는다(grid-column-settings-render 시험과 같은 방식).
 * 저장 규칙 자체(순수·제어기)는 grid-personalize·grid-personalize-hook 시험이 본다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { gridOptsKey, gridPrefKey, type GridPrefs } from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS } from "../../src/components/grid/grid-personalize-hook";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-as";
const KEY = gridPrefKey("u1", SCREEN, "main");
const OPTS = gridOptsKey("u1", SCREEN, "main");
const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "A", name: "가", qty: 1 },
  { code: "B", name: "나", qty: 2 },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

function gridEl(props: Partial<AgDataGridProps> = {}, key?: string) {
  // 엑셀 출력은 GridPanel 안에서 기본 켬이라 메뉴가 늘 생긴다. 이 파일은 개인화 항목만 보므로 엑셀은 끈다(엑셀은 grid-settings-menu-excel 시험).
  return createElement(AgDataGrid, { key, columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", height: "auto", excelExport: false, ...props });
}
function panel(children: ReactElement[], key?: string) {
  return createElement(TabPageContext.Provider, { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } }, createElement(GridPanel, { key, title: "목록" }, ...children));
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
function saved(key = KEY): GridPrefs | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as GridPrefs) : null;
}
function seed(prefs: Omit<GridPrefs, "v" | "savedAt">, key = KEY) {
  localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: 1, ...prefs }));
}
const SEEDED: Omit<GridPrefs, "v" | "savedAt"> = {
  cols: [{ colId: "qty", hide: false, pinned: null }, { colId: "code", hide: false, pinned: null }, { colId: "name", hide: false, pinned: null }],
};

const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const switchInput = () => tid("grid-autosave-switch") as HTMLInputElement | null;
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
/** 「그리드 설정」 메뉴를 연다(이미 열려 있으면 그대로). 메뉴 항목은 열린 동안에만 DOM 에 있다. */
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
const switchEl = async () => {
  await openMenu();
  return switchInput();
};
const switchChecked = async () => (await switchEl())!.checked;
const menuItem = async (id: string) => {
  await openMenu();
  return document.getElementById(id);
};
const confirmButton = (text: "확인" | "취소") => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text) ?? null;
function rightClick(el: Element) {
  act(() => void el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })));
}
const headerCell = (colId: string) => document.querySelector(`.ag-header-cell[col-id="${colId}"]`)!;
/** 사용자가 머리글을 끌어 컬럼을 옮긴 것처럼 이동 이벤트를 낸다. ag-grid 는 이벤트를 비동기로 나르므로 핸들러가 돌 때까지 잠깐 기다린다. */
async function dragMove(a: GridApi, colId: string, to: number) {
  await act(async () => void a.moveColumns([colId], to));
  await act(async () => void a.dispatchEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true } as never));
  await wait(30);
}
const setSpy = () => localStorage.setItem as unknown as MockInstance;
/** 시험이 심은 값 쓰기는 세지 않도록 심은 직후 한 번 비운다. */
const clearSetCalls = () => setSpy().mockClear();
const setCount = (key: string) => setSpy().mock.calls.filter((c) => c[0] === key).length;

beforeEach(async () => {
  localStorage.clear();
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`그리드가 요청을 보냈다: ${String(input)}`);
    }),
  );
  vi.spyOn(ls, "setItem");
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("GridPanel 의 자동 저장 스위치", () => {
  it("옛 저장값(옆 키 없음)은 켬으로 읽는다 — 머리줄 설정 아이콘 메뉴 안에 스위치·[설정 초기화…] 가 함께 놓인다", async () => {
    seed(SEEDED);
    await show(panel([gridEl()]));
    // 머리줄에는 아이콘 하나만 — 예전 [컬럼 설정]·스위치·[초기화] 가 따로 없다
    const icon = tid("grid-settings-menu")!;
    expect(icon.getAttribute("aria-label")).toBe("그리드 설정");
    expect(document.querySelector(".grid-panel-settings-slot")!.contains(icon)).toBe(true);
    expect(document.querySelector(".grid-panel-header-actions")!.textContent).toBe("");
    expect(switchInput()).toBeNull();
    await openMenu();
    expect(switchInput()!.checked).toBe(true);
    expect(tid("grid-settings-dropdown")!.textContent).toContain("자동 설정 저장");
    expect(tid("grid-columns-button")!.textContent).toBe("컬럼 설정…");
    const reset = document.getElementById("btn_grid_reset") as HTMLElement;
    expect(reset.textContent).toBe("설정 초기화…");
    expect(reset.hasAttribute("disabled")).toBe(false);
    expect(tid("grid-reset-button")).toBe(reset);
    // 엑셀을 켜지 않은 그리드에는 엑셀 항목이 없다
    expect(tid("grid-excel")).toBeNull();
  });

  it("스위치를 눌러도 메뉴는 닫히지 않고 값만 바뀐다 — 항목 전체가 누름 대상이다", async () => {
    await show(panel([gridEl()]));
    await openMenu();
    await click(tid("grid-settings-dropdown")!.querySelector('[data-testid="grid-autosave-item"]'));
    await wait(60);
    expect(tid("grid-settings-dropdown")).not.toBeNull();
    expect(tid("grid-settings-menu")!.getAttribute("aria-expanded")).toBe("true");
    expect(switchInput()!.checked).toBe(false);
    expect(tid("grid-autosave-item")!.getAttribute("aria-label")).toBe("자동 설정 저장 꺼짐");
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
  });

  it("스위치는 마우스 클릭을 받지 않고(pointer-events: none) 항목이 받는다 — 트랙 클릭이 label 합성 클릭과 겹쳐 두 번 토글되지 않는다", async () => {
    await show(panel([gridEl()]));
    await openMenu();
    const root = switchInput()!.closest<HTMLElement>(".mantine-Switch-root")!;
    expect(root.style.pointerEvents).toBe("none");
    // pointer-events 가 막은 마우스 클릭은 스위치 아래의 오른쪽 구역(항목의 일부)에 닿는다
    await click(root.parentElement);
    await wait(60);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
    expect(switchInput()!.checked).toBe(false);
  });

  it("옆 키가 false 면 꺼진 채 그려지고, 헤더를 옮겨도 debounce 가 지난 뒤 저장 키가 바뀌지 않는다", async () => {
    seed(SEEDED);
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: false }));
    const before = localStorage.getItem(KEY);
    clearSetCalls();
    await show(panel([gridEl()]));
    expect(await switchChecked()).toBe(false);
    const a = api();
    expect(order(a)).toEqual(["qty", "code", "name"]);
    await dragMove(a, "name", 0);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(order(a)).toEqual(["name", "qty", "code"]);
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(setCount(KEY)).toBe(0);
  });

  it("켠 상태에서는 헤더 이동이 저장된다(스위치 도입 전과 같다)", async () => {
    await show(panel([gridEl()]));
    await dragMove(api(), "qty", 0);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(saved()!.cols.map((c) => c.colId)).toEqual(["qty", "code", "name"]);
  });

  it("토글하면 옆 키에 저장되고 스위치가 바뀐다 — 다시 마운트해도 값이 남는다", async () => {
    await show(panel([gridEl()]));
    await click(await switchEl());
    expect(await switchChecked()).toBe(false);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
    await click(await switchEl());
    expect(await switchChecked()).toBe(true);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: true });
    await click(await switchEl());
    await act(async () => r!.unmount());
    r = null;
    await show(panel([gridEl()]));
    expect(await switchChecked()).toBe(false);
  });

  it("personalize={{ autoSave: false }} 이고 옆 키가 없으면 꺼짐이다 — 옆 키가 있으면 그 값이 이긴다", async () => {
    await show(panel([gridEl({ personalize: { autoSave: false } })]));
    expect(await switchChecked()).toBe(false);
    await act(async () => r!.unmount());
    r = null;
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: true }));
    await show(panel([gridEl({ personalize: { autoSave: false } })]));
    expect(await switchChecked()).toBe(true);
  });

  it("깨진 옆 키는 개발자 기본값으로 읽는다", async () => {
    localStorage.setItem(OPTS, "not json");
    await show(panel([gridEl()]));
    expect(await switchChecked()).toBe(true);
  });

  it("끔 → 켬: 끈 동안 바꾼 모습이 있으면 켜는 순간 한 번 저장한다", async () => {
    seed(SEEDED);
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: false }));
    clearSetCalls();
    await show(panel([gridEl()]));
    await dragMove(api(), "name", 0);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(setCount(KEY)).toBe(0);
    expect(saved()!.cols[0].colId).toBe("qty");
    await click(await switchEl());
    expect(saved()!.cols.map((c) => c.colId)).toEqual(["name", "qty", "code"]);
    expect(setCount(KEY)).toBe(1);
  });

  it("켬 → 끔: 켜져 있던 동안 대기 중인 변경을 먼저 저장한다", async () => {
    await show(panel([gridEl()]));
    await dragMove(api(), "qty", 0);
    await click(await switchEl());
    expect(saved()!.cols.map((c) => c.colId)).toEqual(["qty", "code", "name"]);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(setCount(KEY)).toBe(1);
  });

  it("개인화를 끈 그리드에는 스위치·[초기화] 가 없다", async () => {
    // filter 생략 그리드는 「필터 창 보기」 항목 때문에 메뉴가 생기므로 filter={false} 로 개인화 항목만 본다
    await show(panel([gridEl({ personalize: false, filter: false })]));
    expect(tid("grid-settings-menu")).toBeNull();
    expect(switchInput()).toBeNull();
    expect(document.getElementById("btn_grid_reset")).toBeNull();
    expect(document.querySelector(".grid-panel-header-actions")).toBeNull();
  });

  it("그리드가 둘인 GridPanel 에서 첫 그리드를 언마운트하면 스위치가 둘째 그리드의 값을 보인다", async () => {
    localStorage.setItem(gridOptsKey("u1", SCREEN, "a"), JSON.stringify({ autoSave: false }));
    localStorage.setItem(gridOptsKey("u1", SCREEN, "b"), JSON.stringify({ autoSave: true }));
    await show(panel([gridEl({ gridId: "a" }, "a"), gridEl({ gridId: "b" }, "b")], "p"));
    expect(await switchChecked()).toBe(false);
    await show(panel([gridEl({ gridId: "b" }, "b")], "p"));
    expect(await switchEl()).not.toBeNull();
    expect(await switchChecked()).toBe(true);
    // 둘째가 대상이 된 뒤 토글은 둘째 그리드의 옆 키에 간다
    await click(await switchEl());
    expect(JSON.parse(localStorage.getItem(gridOptsKey("u1", SCREEN, "b"))!)).toEqual({ autoSave: false });
    expect(JSON.parse(localStorage.getItem(gridOptsKey("u1", SCREEN, "a"))!)).toEqual({ autoSave: false });
  });
});

describe("등록부 이어받기", () => {
  it("같은 키 그리드 둘에서 주인이 스위치를 끄고 사라지면 이어받은 그리드도 꺼짐이고 헤더를 옮겨도 저장하지 않는다", async () => {
    seed(SEEDED);
    clearSetCalls();
    // 둘 다 gridId 가 같다 — 첫째(a)가 키를 차지하고 둘째(b)는 기다린다
    await show(panel([gridEl({}, "a"), gridEl({}, "b")], "p"));
    expect(await switchChecked()).toBe(true);
    await click(await switchEl());
    expect(await switchChecked()).toBe(false);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
    // 주인이 사라지면 b 가 이어받는다
    await show(panel([gridEl({}, "b")], "p"));
    expect(await switchEl()).not.toBeNull();
    expect(await switchChecked()).toBe(false);
    clearSetCalls();
    const b = apis().at(-1)!;
    await dragMove(b, "name", 0);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(setCount(KEY)).toBe(0);
  });
});

describe("[초기화]", () => {
  it("누르면 확인 창이 뜨고, [확인] 뒤에는 저장 키가 없고 화면이 정의 순서이며 옆 키는 남는다", async () => {
    seed(SEEDED);
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: true }));
    await show(panel([gridEl()]));
    const a = api();
    expect(order(a)).toEqual(["qty", "code", "name"]);
    await click(await menuItem("btn_grid_reset"));
    const msg = tid("grid-reset-confirm")!;
    expect(msg.textContent).toBe("이 그리드의 컬럼 순서·너비·표시·고정·정렬을 기본값으로 되돌리고 저장한 설정을 지웁니다. 계속할까요?");
    expect(document.body.textContent).toContain("초기화");
    // 확인 전에는 그대로
    expect(order(a)).toEqual(["qty", "code", "name"]);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    await click(confirmButton("확인"));
    await wait(50);
    expect(tid("grid-reset-confirm")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(order(a)).toEqual(["code", "name", "qty"]);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: true });
    expect(await switchChecked()).toBe(true);
  });

  it("[취소] 면 아무 일도 없다", async () => {
    seed(SEEDED);
    await show(panel([gridEl()]));
    const before = localStorage.getItem(KEY);
    await click(await menuItem("btn_grid_reset"));
    expect(tid("grid-reset-confirm")).not.toBeNull();
    await click(confirmButton("취소"));
    await wait(50);
    expect(tid("grid-reset-confirm")).toBeNull();
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(order(api())).toEqual(["qty", "code", "name"]);
  });

  it("자동 저장이 꺼진 상태에서도 동작하고 스위치 값은 꺼진 채 남는다", async () => {
    seed(SEEDED);
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: false }));
    await show(panel([gridEl()]));
    await dragMove(api(), "name", 0);
    await click(await menuItem("btn_grid_reset"));
    await click(confirmButton("확인"));
    await wait(50);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(order(api())).toEqual(["code", "name", "qty"]);
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
    expect(await switchChecked()).toBe(false);
    // 초기화 뒤 켜도 저장할 것이 없다
    await click(await switchEl());
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("머리글 우클릭 메뉴", () => {
  it("[자동 설정 저장] 은 켜져 있으면 체크 표시가 있고, 누르면 토글하고 메뉴를 닫는다", async () => {
    await show(panel([gridEl()]));
    rightClick(headerCell("name"));
    await wait(50);
    const item = () => tid("grid-header-menu-autosave")!;
    expect(item().textContent).toBe("자동 설정 저장");
    expect(item().getAttribute("aria-label")).toBe("자동 설정 저장 켜짐");
    expect(item().querySelector("svg")).not.toBeNull();
    await click(item());
    await wait(400);
    expect(tid("grid-header-menu")).toBeNull();
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
    // GridPanel 스위치도 따라간다
    expect(await switchChecked()).toBe(false);
    rightClick(headerCell("name"));
    await wait(50);
    expect(item().querySelector("svg")).toBeNull();
    expect(item().getAttribute("aria-label")).toBe("자동 설정 저장 꺼짐");
    await click(item());
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: true });
    expect(await switchChecked()).toBe(true);
  });

  it("GridPanel 없이 쓰는 그리드도 메뉴로 토글한다", async () => {
    await show(createElement(TabPageContext.Provider, { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } }, gridEl()));
    rightClick(headerCell("name"));
    await wait(50);
    await click(tid("grid-header-menu-autosave"));
    expect(JSON.parse(localStorage.getItem(OPTS)!)).toEqual({ autoSave: false });
  });

  it("[초기화] 는 바로 되돌리지 않고 확인 창을 띄운다", async () => {
    seed(SEEDED);
    await show(panel([gridEl()]));
    rightClick(headerCell("name"));
    await wait(50);
    await click(tid("grid-header-menu-reset"));
    await wait(50);
    expect(tid("grid-header-menu")).toBeNull();
    expect(tid("grid-reset-confirm")).not.toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    await click(confirmButton("확인"));
    await wait(50);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("설정 창 [지금 상태 저장]", () => {
  it("켜져 있으면 보이지 않는다", async () => {
    await show(panel([gridEl()]));
    await click(await menuItem("btn_grid_columns"));
    expect(tid("column-settings")).not.toBeNull();
    expect(tid("column-settings-save")).toBeNull();
  });

  it("꺼져 있을 때만 보이고, 누르면 적용하고 저장 1회 뒤 닫는다 — [적용] 은 저장하지 않는다", async () => {
    localStorage.setItem(OPTS, JSON.stringify({ autoSave: false }));
    clearSetCalls();
    await show(panel([gridEl()]));
    const a = api();
    // [적용] — 화면에만
    await click(await menuItem("btn_grid_columns"));
    await click(tid("column-settings-up-qty"));
    await click(tid("column-settings-apply"));
    expect(order(a)).toEqual(["code", "qty", "name"]);
    expect(setCount(KEY)).toBe(0);
    // [지금 상태 저장]
    await click(await menuItem("btn_grid_columns"));
    expect(tid("column-settings-save")!.textContent).toBe("지금 상태 저장");
    await click(tid("column-settings-up-qty"));
    await click(tid("column-settings-save"));
    expect(tid("column-settings")).toBeNull();
    expect(order(a)).toEqual(["qty", "code", "name"]);
    expect(setCount(KEY)).toBe(1);
    expect(saved()!.cols.map((c) => c.colId)).toEqual(["qty", "code", "name"]);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 150);
    expect(setCount(KEY)).toBe(1);
  });
});
