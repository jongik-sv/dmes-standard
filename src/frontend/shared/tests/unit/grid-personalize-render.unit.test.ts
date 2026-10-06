/** @vitest-environment happy-dom */
/**
 * AgDataGrid 컬럼 개인화 연결(C2) — 실제 ag-grid 로 그려 복원·자동 저장·자동 너비 가드·등록부·재주입·켜고 끄기를 확인한다.
 * 그리드 api 는 AgGridReact.render 의 this 로 잡는다(grid-mdm-html-header-label 시험과 같은 방식).
 */
import { StrictMode, act, createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { gridPrefKey, type GridPrefs } from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS, useGridPersonalize } from "../../src/components/grid/grid-personalize-hook";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-1";
const KEY = gridPrefKey("u1", SCREEN, "main");
const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "A", name: "가", qty: 1 },
  { code: "B", name: "나", qty: 2 },
];

let container: HTMLDivElement;
let root: Root | null = null;
let renderSpy: MockInstance;
let warn: MockInstance;

/**
 * 사용자 확인 상태를 만든다. 그리드는 /api/auth/me 를 부르지 않고 공유 저장소를 읽기만 하므로, 포털 부팅이 하던 확인을 시험이 대신한다.
 * `user` 가 null 이면 확인 전(빈 사용자). 어떤 요청이든 오면 시험이 실패하도록 fetch 를 막는다.
 */
async function stubUser(user: string | null) {
  if (user) await seedCurrentUser(user);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`그리드가 요청을 보냈다: ${String(input)}`);
    }),
  );
}

function wait(ms: number) {
  return act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function grid(props: Partial<AgDataGridProps> = {}, tabId = "t1", key?: string): ReactNode {
  return createElement(
    TabPageContext.Provider,
    { key, value: { pageId: SCREEN, serviceId: "", tabId } },
    createElement(AgDataGrid, { columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", ...props }),
  );
}

async function show(el: ReactNode) {
  await act(async () => root!.render(el));
  await wait(120);
}

/** 마운트 순서대로 AgGridReact 인스턴스의 api. */
function apis(): GridApi[] {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed());
}
const api = (i = 0) => apis()[i];
const widths = (a: GridApi) => a.getAllGridColumns().map((c) => [c.getColId(), c.getActualWidth()]);
const order = (a: GridApi) => a.getAllGridColumns().map((c) => c.getColId());
function saved(key = KEY): GridPrefs | null {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as GridPrefs) : null;
}
function seed(prefs: Omit<GridPrefs, "v" | "savedAt">, key = KEY) {
  localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: 1, ...prefs }));
}
/** 사용자 조작을 흉내 낸다 — 상태는 api 로 바꾸고(이벤트 source = api 라 저장 안 됨), UI source 이벤트를 따로 보낸다. */
async function uiResize(a: GridApi, colId: string, width: number) {
  await act(async () => void a.setColumnWidths([{ key: colId, newWidth: width }]));
  await act(
    async () =>
      void a.dispatchEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [a.getColumn(colId)] } as never),
  );
  await wait(10);
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  const g = globalThis as Record<string, unknown>;
  delete g.__dkOasisGridPersonalizeRegistry__;
});

describe("복원", () => {
  it("저장값의 순서·너비·숨김·고정·정렬을 복원하고 자동 너비·여백 분배가 덮지 않는다", async () => {
    await stubUser("u1");
    seed({
      cols: [
        { colId: "qty", width: 210, hide: false, pinned: "left" },
        { colId: "code", width: 70, hide: false, pinned: null },
        { colId: "name", width: 55, hide: true, pinned: null },
      ],
      sort: [{ colId: "qty", sort: "desc" }],
    });
    await show(grid({ columnSizing: "auto" }));
    const a = api();
    expect(order(a)).toEqual(["qty", "code", "name"]);
    expect(a.getColumn("qty")!.getActualWidth()).toBe(210);
    expect(a.getColumn("code")!.getActualWidth()).toBe(70);
    expect(a.getColumn("name")!.isVisible()).toBe(false);
    expect(a.getColumn("qty")!.getPinned()).toBe("left");
    expect(a.getColumn("qty")!.getSort()).toBe("desc");
    const auto = vi.spyOn(a, "autoSizeAllColumns");
    const fit = vi.spyOn(a, "sizeColumnsToFit");
    await show(grid({ columnSizing: "auto", data: [...DATA, { code: "C", name: "아주아주긴이름", qty: 3 }] }));
    expect(auto).not.toHaveBeenCalled();
    expect(fit).not.toHaveBeenCalled();
    expect(a.getColumn("code")!.getActualWidth()).toBe(70);
    // 복원은 저장하지 않는다(source api)
    expect(saved()!.savedAt).toBe(1);
  });

  it("columnSizing=fit — 저장 너비가 있는 컬럼만 flex 를 끄고 나머지는 flex 로 채운다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 150 }, { colId: "name" }, { colId: "qty" }] });
    await show(grid({ columnSizing: "fit" }));
    const a = api();
    expect(a.getColumn("code")!.getFlex()).toBeFalsy();
    expect(a.getColumn("code")!.getActualWidth()).toBe(150);
    expect(a.getColumn("name")!.getFlex()).toBe(120);
  });

  it("userId 가 비었으면 읽지도 쓰지도 않는다", async () => {
    await stubUser(null);
    seed({ cols: [{ colId: "code", width: 70 }] });
    const getItem = vi.spyOn(ls, "getItem");
    const setItem = vi.spyOn(ls, "setItem");
    await show(grid());
    expect(getItem.mock.calls.filter(([k]) => String(k).startsWith("dmes:grid:"))).toEqual([]);
    expect(api().getColumn("code")!.getActualWidth()).toBe(100);
    await uiResize(api(), "name", 200);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("사용자 확인 알림(포털 부팅) 뒤 한 번만 읽어 적용한다", async () => {
    await stubUser(null);
    seed({ cols: [{ colId: "code", width: 70 }] });
    const getItem = vi.spyOn(ls, "getItem");
    const reads = () => getItem.mock.calls.filter(([k]) => k === KEY).length;
    await show(grid());
    expect(reads()).toBe(0);
    expect(api().getColumn("code")!.getActualWidth()).toBe(100);
    await seedCurrentUser("u1"); // 공유 저장소가 구독자에게 알린다
    await wait(50);
    expect(reads()).toBe(1);
    expect(api().getColumn("code")!.getActualWidth()).toBe(70);
    await show(grid({ data: [...DATA] }));
    await show(grid({ columns: [...COLUMNS] }));
    expect(reads()).toBe(1);
  });

  it("personalize=false 면 읽지도 저장하지도 않는다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    const getItem = vi.spyOn(ls, "getItem");
    await show(grid({ personalize: false }));
    expect(getItem.mock.calls.filter(([k]) => k === KEY)).toEqual([]);
    expect(api().getColumn("code")!.getActualWidth()).toBe(100);
    await uiResize(api(), "name", 200);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.savedAt).toBe(1);
  });

  it("personalize={sort:false} 면 정렬은 복원·저장하지 않는다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }], sort: [{ colId: "code", sort: "asc" }] });
    await show(grid({ personalize: { sort: false } }));
    const a = api();
    expect(a.getColumn("code")!.getActualWidth()).toBe(70);
    expect(a.getColumn("code")!.getSort()).toBeFalsy();
    await act(async () => void a.applyColumnState({ state: [{ colId: "name", sort: "desc" }] }));
    await act(async () => void a.dispatchEvent({ type: "sortChanged", source: "uiColumnSorted" } as never));
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.savedAt).toBe(1);
    await uiResize(a, "name", 222);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.sort).toBeUndefined();
    expect(saved()!.cols.find((c) => c.colId === "name")!.width).toBe(222);
  });

  it("열 정의가 다시 들어와도(새 columns 배열·머리글 변경) 복원값이 유지된다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "qty", width: 210 }, { colId: "code", width: 70 }, { colId: "name", width: 55, hide: true }] });
    await show(grid());
    const a = api();
    expect(order(a)).toEqual(["qty", "code", "name"]);
    await show(grid({ columns: COLUMNS.map((c) => ({ ...c, header: `${c.header}!` })) }));
    expect(a.getColumn("code")!.getColDef().headerName).toBe("코드!");
    expect(order(a)).toEqual(["qty", "code", "name"]);
    expect(widths(a)).toEqual([
      ["qty", 210],
      ["code", 70],
      ["name", 55],
    ]);
    expect(a.getColumn("name")!.isVisible()).toBe(false);
  });

  it("저장값이 없는 그리드는 열 정의 재주입 때 예전처럼 정의값을 다시 쓴다", async () => {
    await stubUser("u1");
    await show(grid());
    const a = api();
    await act(async () => void a.setColumnWidths([{ key: "code", newWidth: 300 }])); // api 변경 — 개인 상태가 아니다
    await show(grid({ columns: COLUMNS.map((c) => ({ ...c })) }));
    expect(a.getColumn("code")!.getActualWidth()).toBe(100);
  });
});

describe("저장", () => {
  it("UI 이벤트만 debounce 뒤 저장하고, api 이벤트는 저장하지 않으며, 언마운트 때 대기 저장을 흘려 보낸다", async () => {
    await stubUser("u1");
    await show(grid());
    const a = api();
    await act(async () => void a.setColumnWidths([{ key: "code", newWidth: 160 }]));
    await act(async () => void a.moveColumns(["qty"], 0));
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()).toBeNull();

    await uiResize(a, "name", 180);
    expect(saved()).toBeNull();
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    const s = saved()!;
    // 순서는 지금 상태, 너비는 사용자가 끈 컬럼(name)만 — api 로 바꾼 code 너비는 담지 않는다.
    expect(s.cols.map((c) => [c.colId, c.width])).toEqual([
      ["qty", undefined],
      ["code", undefined],
      ["name", 180],
    ]);

    await act(async () => void a.moveColumns(["code"], 0));
    await act(async () => void a.dispatchEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true } as never));
    await wait(10);
    expect(saved()!.cols[0].colId).toBe("qty");
    await act(async () => root!.unmount());
    root = null;
    expect(saved()!.cols[0].colId).toBe("code");
  });

  it("사용자가 바꾼 뒤에는 자동 너비가 바꾼 너비를 덮지 않는다", async () => {
    await stubUser("u1");
    await show(grid({ columnSizing: "auto" }));
    const a = api();
    await uiResize(a, "code", 333);
    const auto = vi.spyOn(a, "autoSizeAllColumns");
    await show(grid({ columnSizing: "auto", data: [...DATA, { code: "Z", name: "z", qty: 9 }] }));
    expect(auto).not.toHaveBeenCalled();
    expect(a.getColumn("code")!.getActualWidth()).toBe(333);
  });
});

describe("등록부", () => {
  const two = (b: Partial<AgDataGridProps> = {}, tabB = "t1", a: Partial<AgDataGridProps> = {}) =>
    createElement("div", null, grid(a, "t1", "A"), grid(b, tabB, "B"));

  it("같은 탭 같은 키의 두 번째 그리드는 꺼지고 경고한다. 다른 탭이면 둘 다 켜진다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    await show(two());
    expect(api(0).getColumn("code")!.getActualWidth()).toBe(70);
    expect(api(1).getColumn("code")!.getActualWidth()).toBe(100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("gridId");
    // 꺼진 그리드의 조작은 저장하지 않는다
    await uiResize(api(1), "name", 199);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.savedAt).toBe(1);

    await act(async () => root!.unmount());
    root = createRoot(container);
    warn.mockClear();
    await show(two({}, "t2"));
    expect(apis().map((x) => x.getColumn("code")!.getActualWidth())).toEqual([70, 70]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("gridId 가 다르면 같은 탭이라도 충돌하지 않는다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    seed({ cols: [{ colId: "code", width: 80 }] }, gridPrefKey("u1", SCREEN, "sub"));
    await show(two({ gridId: "sub" }));
    expect(apis().map((x) => x.getColumn("code")!.getActualWidth())).toEqual([70, 80]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("등록부를 바로 차지하면 그리드를 한 번 더 렌더하지 않는다(개인화를 끈 그리드와 렌더 횟수가 같다)", async () => {
    await stubUser("u1");
    await show(grid({ personalize: false }));
    const off = renderSpy.mock.calls.length;
    await act(async () => root!.unmount());
    root = createRoot(container);
    renderSpy.mockClear();
    await show(grid());
    expect(renderSpy.mock.calls.length).toBe(off);
  });

  it("StrictMode 의 마운트→정리→마운트에서 자기 자신과 충돌하지 않는다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    await show(createElement(StrictMode, null, grid()));
    expect(api().getColumn("code")!.getActualWidth()).toBe(70);
    expect(warn).not.toHaveBeenCalled();
  });

  it("언마운트하면 등록을 놓고, 기다리던 그리드가 이어받아 복원·저장한다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    await show(two());
    const b = api(1);
    expect(b.getColumn("code")!.getActualWidth()).toBe(100);
    await show(createElement("div", null, grid({}, "t1", "B")));
    expect(b.getColumn("code")!.getActualWidth()).toBe(70);
    await uiResize(b, "name", 199);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.cols.find((c) => c.colId === "name")!.width).toBe(199);
  });
});

describe("personalize 가 마운트 뒤에 바뀜(숨은 탭 패널)", () => {
  const pair = (aOn: boolean, bOn: boolean) =>
    createElement(
      "div",
      null,
      grid({ personalize: aOn ? undefined : false }, "t1", "A"),
      grid({ personalize: bOn ? undefined : false }, "t1", "B"),
    );

  it("false → 켬이면 그때 복원·등록하고, 켬 → false 면 대기 저장을 흘려 보낸 뒤 더는 저장하지 않는다(상태는 그대로)", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    await show(grid({ personalize: false }));
    const a = api();
    expect(a.getColumn("code")!.getActualWidth()).toBe(100);
    await show(grid({}));
    expect(a.getColumn("code")!.getActualWidth()).toBe(70);

    await uiResize(a, "name", 177);
    expect(saved()!.savedAt).toBe(1);
    await show(grid({ personalize: false }));
    expect(saved()!.cols.find((c) => c.colId === "name")!.width).toBe(177);
    expect(a.getColumn("name")!.getActualWidth()).toBe(177);
    const before = localStorage.getItem(KEY);
    await uiResize(a, "name", 188);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(localStorage.getItem(KEY)).toBe(before);

    // 다시 켜면 그 구간에서 다시 한 번 복원한다
    await show(grid({}));
    expect(a.getColumn("name")!.getActualWidth()).toBe(177);
  });

  it("같은 키 두 그리드: A 켬·B 끔 → A 끔·B 켬이면 B 가 복원·저장하고 A 는 저장하지 않는다", async () => {
    await stubUser("u1");
    seed({ cols: [{ colId: "code", width: 70 }] });
    await show(pair(true, false));
    const [a, b] = apis();
    expect(a.getColumn("code")!.getActualWidth()).toBe(70);
    expect(b.getColumn("code")!.getActualWidth()).toBe(100);
    await uiResize(a, "qty", 111); // A 의 대기 저장 — 끌 때 흘려 보낸다
    await show(pair(false, true));
    expect(saved()!.cols.find((c) => c.colId === "qty")!.width).toBe(111);
    expect(b.getColumn("code")!.getActualWidth()).toBe(70);
    expect(b.getColumn("qty")!.getActualWidth()).toBe(111);
    expect(warn).not.toHaveBeenCalled();

    await uiResize(a, "name", 155);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.cols.find((c) => c.colId === "name")!.width).toBeUndefined();
    await uiResize(b, "name", 166);
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 50);
    expect(saved()!.cols.find((c) => c.colId === "name")!.width).toBe(166);
  });
});

describe("handle.enabled 가 렌더된 값으로 바뀐다(C3 컬럼 설정 버튼·메뉴가 읽는 값)", () => {
  const fakeApi = {
    isDestroyed: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
    getColumnState: () => [],
    applyColumnState: () => true,
    resetColumnState: () => {},
  } as unknown as GridApi;
  const DEFS = [{ field: "code" }, { field: "name" }];
  let renders = 0;

  /** AgDataGrid 처럼 마운트 뒤 효과에서 그리드가 준비되는 탐침. handle.enabled 를 글자로 그린다. */
  function Probe({ id, on }: { id: string; on: boolean }) {
    renders++;
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    const sizedColumnsRef = useRef<ReadonlySet<string>>(new Set());
    const h = useGridPersonalize({
      getApi: () => fakeApi,
      gridReady: ready,
      personalize: on ? undefined : false,
      columns: COLUMNS,
      columnDefs: DEFS,
      selectable: false,
      rowKey: "code",
      sizedColumnsRef,
      onRestored: () => {},
      onReset: () => {},
    });
    return createElement("span", { "data-probe": id }, String(h.enabled));
  }
  const probes = (...list: Array<{ id: string; on: boolean }>) =>
    createElement(
      TabPageContext.Provider,
      { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } },
      ...list.map((p) => createElement(Probe, { key: p.id, ...p })),
    );
  const shown = (id: string) => container.querySelector(`[data-probe="${id}"]`)?.textContent;

  it("켬 → 끔 → 켬(그리드가 이미 준비된 뒤)에도 enabled 가 true·false·true 로 그려진다", async () => {
    await stubUser("u1");
    await show(probes({ id: "A", on: true }));
    expect(shown("A")).toBe("true");
    await show(probes({ id: "A", on: false }));
    expect(shown("A")).toBe("false");
    await show(probes({ id: "A", on: true }));
    expect(shown("A")).toBe("true");
  });

  it("기다리던 그리드가 이어받으면 enabled 가 true 로, 꺼진 쪽은 false 로 그려진다", async () => {
    await stubUser("u1");
    await show(probes({ id: "A", on: true }, { id: "B", on: true }));
    expect([shown("A"), shown("B")]).toEqual(["true", "false"]);
    await show(probes({ id: "B", on: true }));
    expect(shown("B")).toBe("true");
  });

  it("A 켬·B 끔 → A 끔·B 켬이면 B 가 true, A 가 false 로 그려진다", async () => {
    await stubUser("u1");
    await show(probes({ id: "A", on: true }, { id: "B", on: false }));
    expect([shown("A"), shown("B")]).toEqual(["true", "false"]);
    await show(probes({ id: "A", on: false }, { id: "B", on: true }));
    expect([shown("A"), shown("B")]).toEqual(["false", "true"]);
  });

  it("마운트 때 바로 차지하면 다시 렌더를 더하지 않는다(끈 탐침과 렌더 횟수가 같다)", async () => {
    await stubUser("u1");
    renders = 0;
    await show(probes({ id: "A", on: false }));
    const off = renders;
    await act(async () => root!.unmount());
    root = createRoot(container);
    renders = 0;
    await show(probes({ id: "A", on: true }));
    expect(renders).toBe(off);
    expect(shown("A")).toBe("true");
  });
});
