/**
 * 컬럼 개인화 제어기·등록부·기본 컬럼(C2) — 그리드 렌더 없이 가짜 API·저장소로 확인한다.
 * 실제 AgDataGrid 연결은 grid-personalize-render.unit.test.ts 가 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColDef, ColGroupDef, ColumnState } from "ag-grid-community";

import {
  GRID_PERSONALIZE_SAVE_DEBOUNCE_MS,
  claimGridPersonalizeKey,
  createGridPersonalizeController,
  defaultColumnsFromDefs,
  gridPersonalizeRegistryKey,
  isPersonalizeSaveEvent,
  releaseGridPersonalizeKey,
  type GridPersonalizeApi,
  type GridPersonalizeContext,
} from "../../src/components/grid/grid-personalize-hook";
import { GRID_SELECTION_COL_ID, gridPrefKey, type GridPrefs } from "../../src/components/grid/grid-personalize";

class MemStorage implements Storage {
  map = new Map<string, string>();
  sets: string[] = [];
  gets: string[] = [];
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    this.gets.push(k);
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.sets.push(k);
    this.map.set(k, v);
  }
}

function fakeApi(initial: ColumnState[]) {
  let state = initial.map((s) => ({ ...s }));
  const applied: Array<{ state?: ColumnState[]; applyOrder?: boolean }> = [];
  const api = {
    getColumnState: () => state.map((s) => ({ ...s })),
    applyColumnState: vi.fn((p: { state?: ColumnState[]; applyOrder?: boolean }) => {
      applied.push(p);
      const byId = new Map(state.map((s) => [s.colId, s]));
      for (const s of p.state ?? []) Object.assign(byId.get(s.colId) ?? {}, s);
      if (p.applyOrder && p.state) {
        const order = p.state.map((s) => s.colId);
        state = [...order.map((id) => byId.get(id)!).filter(Boolean), ...state.filter((s) => !order.includes(s.colId))];
      }
      return true;
    }),
    resetColumnState: vi.fn(() => {
      state = initial.map((s) => ({ ...s }));
    }),
    isDestroyed: vi.fn(() => false),
    set: (next: ColumnState[]) => {
      state = next;
    },
  };
  return { api, applied };
}

const INITIAL: ColumnState[] = [
  { colId: "a", width: 100, hide: false, pinned: null, sort: null },
  { colId: "b", width: 100, hide: false, pinned: null, sort: null },
  { colId: "c", width: 100, hide: false, pinned: null, sort: null },
];

function setup(ctxOver: Partial<GridPersonalizeContext> = {}) {
  const storage = new MemStorage();
  const { api, applied } = fakeApi(INITIAL);
  const ctx: GridPersonalizeContext = {
    active: true,
    userId: "u1",
    screenKey: "scr",
    gridId: "main",
    sort: true,
    defaults: [{ colId: "a", width: 100 }, { colId: "b", width: 100 }, { colId: "c", width: 100 }],
    locked: new Set(["a"]),
    ...ctxOver,
  };
  let locked = false;
  const onReset = vi.fn();
  let liveApi: GridPersonalizeApi | null = api as unknown as GridPersonalizeApi;
  const c = createGridPersonalizeController({
    getApi: () => liveApi,
    getContext: () => ctx,
    setWidthLocked: (v) => {
      locked = v;
    },
    onReset,
    storage,
  });
  return {
    c,
    api,
    applied,
    storage,
    ctx,
    onReset,
    isLocked: () => locked,
    dropApi: () => {
      liveApi = null;
    },
    saved: () => {
      const raw = storage.map.get(gridPrefKey("u1", "scr", "main"));
      return raw ? (JSON.parse(raw) as GridPrefs) : null;
    },
  };
}

const PREFS: GridPrefs = {
  v: 1,
  savedAt: 1,
  cols: [
    { colId: "c", width: 150, hide: false, pinned: "left" },
    { colId: "a", width: 80, hide: true, pinned: null },
    { colId: "b", width: 90, hide: true, pinned: null },
  ],
  sort: [{ colId: "b", sort: "desc" }],
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("isPersonalizeSaveEvent", () => {
  it("UI source 만 저장하고 api·autosize·sizeColumnsToFit·flex·gridOptionsChanged 는 저장하지 않는다", () => {
    for (const source of ["uiColumnMoved", "uiColumnResized", "uiColumnDragged", "uiColumnSorted", "columnMenu", "contextMenu", "toolPanelUi"]) {
      expect(isPersonalizeSaveEvent({ type: "columnMoved", source, finished: true }, true), source).toBe(true);
    }
    for (const source of ["api", "autosizeColumns", "sizeColumnsToFit", "flex", "gridOptionsChanged", "gridInitializing", undefined]) {
      expect(isPersonalizeSaveEvent({ type: "columnResized", source, finished: true }, true), String(source)).toBe(false);
    }
  });
  it("크기 바꾸기는 끌기를 마친 이벤트만, 정렬은 정렬 저장이 켜졌을 때만", () => {
    expect(isPersonalizeSaveEvent({ type: "columnResized", source: "uiColumnResized", finished: false }, true)).toBe(false);
    expect(isPersonalizeSaveEvent({ type: "columnResized", source: "uiColumnResized", finished: true }, true)).toBe(true);
    expect(isPersonalizeSaveEvent({ type: "sortChanged", source: "uiColumnSorted" }, true)).toBe(true);
    expect(isPersonalizeSaveEvent({ type: "sortChanged", source: "uiColumnSorted" }, false)).toBe(false);
  });
});

describe("defaultColumnsFromDefs", () => {
  it("정의 순서(열 그룹은 잎만)·정의값, 선택 체크박스는 맨 앞", () => {
    const defs: (ColDef | ColGroupDef)[] = [
      { colId: "__rowNo", width: 56, pinned: "left" },
      { field: "a", width: 100, hide: true },
      { groupId: "g", children: [{ field: "b", flex: 2 }, { field: "c", width: 80, pinned: "right" }] },
    ];
    expect(defaultColumnsFromDefs(defs, true)).toEqual([
      { colId: GRID_SELECTION_COL_ID },
      { colId: "__rowNo", width: 56, pinned: "left" },
      { colId: "a", width: 100, hide: true },
      { colId: "b" },
      { colId: "c", width: 80, pinned: "right" },
    ]);
    expect(defaultColumnsFromDefs(defs, false)[0].colId).toBe("__rowNo");
  });
});

describe("등록부", () => {
  it("같은 키는 먼저 차지한 쪽만, 놓으면 다른 쪽이 차지한다. 탭이 다르면 다른 키다", () => {
    const k1 = gridPersonalizeRegistryKey("t1", "scr", "main");
    const a = {};
    const b = {};
    expect(claimGridPersonalizeKey(k1, a)).toBe(true);
    expect(claimGridPersonalizeKey(k1, a)).toBe(true);
    expect(claimGridPersonalizeKey(k1, b)).toBe(false);
    expect(claimGridPersonalizeKey(gridPersonalizeRegistryKey("t2", "scr", "main"), b)).toBe(true);
    releaseGridPersonalizeKey(k1, b); // 남의 키는 놓지 못한다
    expect(claimGridPersonalizeKey(k1, b)).toBe(false);
    releaseGridPersonalizeKey(k1, a);
    expect(claimGridPersonalizeKey(k1, b)).toBe(true);
    releaseGridPersonalizeKey(k1, b);
    releaseGridPersonalizeKey(gridPersonalizeRegistryKey("t2", "scr", "main"), b);
    expect(gridPersonalizeRegistryKey(undefined, "scr", "")).toBe(gridPersonalizeRegistryKey("", "scr", "main"));
  });
});

describe("createGridPersonalizeController", () => {
  it("restore — 저장값이 있으면 병합해 applyOrder 로 적용하고 너비 가드를 건다(잠긴 컬럼 hide 무시, 저장 너비 컬럼은 flex 끔)", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    expect(t.c.restore()).toBe(true);
    expect(t.isLocked()).toBe(true);
    const p = t.applied[0];
    expect(p.applyOrder).toBe(true);
    expect(p.state!.map((s) => [s.colId, s.width, s.hide, s.pinned, s.sort, s.flex])).toEqual([
      ["c", 150, false, "left", null, null],
      ["a", 80, false, null, null, null],
      ["b", 90, true, null, "desc", null],
    ]);
  });
  it("restore — 저장값이 없거나 사용자 ID·화면 키가 비었거나 꺼져 있으면 읽지도 적용하지도 않는다", () => {
    const t = setup();
    expect(t.c.restore()).toBe(false);
    expect(t.api.applyColumnState).not.toHaveBeenCalled();
    expect(t.isLocked()).toBe(false);
    for (const over of [{ userId: "" }, { screenKey: "" }, { active: false }]) {
      const u = setup(over);
      u.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
      u.storage.gets.length = 0;
      expect(u.c.restore()).toBe(false);
      expect(u.storage.gets).toEqual([]);
    }
  });
  it("restore — sort 를 끈 그리드는 저장된 정렬을 적용하지 않는다", () => {
    const t = setup({ sort: false });
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    expect(t.applied[0].state!.every((s) => !("sort" in s))).toBe(true);
  });
  it("restore — 저장값에 지금 컬럼이 하나도 없으면 적용하지 않고, 컬럼이 생긴 뒤 reapply 로 적용한다", () => {
    const t = setup({ defaults: [] });
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    expect(t.c.restore()).toBe(false);
    expect(t.isLocked()).toBe(false);
    t.ctx.defaults = [{ colId: "a" }, { colId: "b" }, { colId: "c" }];
    expect(t.c.reapply()).toBe(true);
    expect(t.applied[0].state!.map((s) => s.colId)).toEqual(["c", "a", "b"]);
  });
  it("reapply — 개인 상태가 없으면 아무것도 하지 않는다(저장값 없는 그리드는 재주입에 손대지 않음)", () => {
    const t = setup();
    expect(t.c.reapply()).toBe(false);
    expect(t.api.applyColumnState).not.toHaveBeenCalled();
  });
  it("UI 이벤트만 debounce 뒤 저장하고, 끝나기 전 상태는 마지막 것으로 덮는다", () => {
    const t = setup();
    t.c.handleEvent({ type: "columnResized", source: "api", finished: true });
    t.c.handleEvent({ type: "columnResized", source: "autosizeColumns", finished: true });
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: false });
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 2);
    expect(t.storage.sets).toEqual([]);
    expect(t.isLocked()).toBe(false);

    t.api.set([{ colId: "b", width: 70 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    expect(t.isLocked()).toBe(true);
    t.api.set([{ colId: "b", width: 75 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: true });
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS - 1);
    expect(t.storage.sets).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.storage.sets).toHaveLength(1);
    expect(t.saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["b", 75],
      ["a", 100],
      ["c", 100],
    ]);
  });
  it("flush — 대기 중인 저장을 바로 쓴다. 그리드 API 가 사라진 뒤에도 잡아 둔 값을 쓴다", () => {
    const t = setup();
    t.c.handleEvent({ type: "columnPinned", source: "uiColumnDragged" });
    t.dropApi();
    t.c.flush();
    expect(t.storage.sets).toHaveLength(1);
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 2);
    expect(t.storage.sets).toHaveLength(1);
    t.c.flush();
    expect(t.storage.sets).toHaveLength(1);
  });
  it("사용자 ID 가 비었거나 꺼져 있으면 이벤트를 저장하지 않는다", () => {
    for (const over of [{ userId: "" }, { active: false }]) {
      const t = setup(over);
      t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
      t.c.flush();
      expect(t.storage.sets).toEqual([]);
    }
  });
  it("sort 를 끈 그리드는 정렬 이벤트를 저장하지 않고 저장값에 정렬을 담지 않는다", () => {
    const t = setup({ sort: false });
    t.c.handleEvent({ type: "sortChanged", source: "uiColumnSorted" });
    t.c.flush();
    expect(t.storage.sets).toEqual([]);
    t.api.set([{ colId: "a", width: 100, sort: "asc", sortIndex: 0 }]);
    t.c.handleEvent({ type: "columnVisible", source: "columnMenu" });
    t.c.flush();
    expect(t.saved()!.sort).toBeUndefined();
  });
  it("재주입 뒤 reapply 는 디바운스 중인 최신 사용자 변경을 다시 적용한다", () => {
    const t = setup();
    t.api.set([{ colId: "c", width: 120 }, { colId: "a", width: 100 }, { colId: "b", width: 100 }]);
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    t.api.set(INITIAL.map((s) => ({ ...s }))); // 열 정의 재주입이 정의값으로 되돌림
    expect(t.c.reapply()).toBe(true);
    expect(t.api.getColumnState().map((s) => [s.colId, s.width])).toEqual([
      ["c", 120],
      ["a", 100],
      ["b", 100],
    ]);
  });
  it("apply — 설정 창 확인: 잠긴 컬럼 hide 는 버리고, 너비가 있으면 flex 를 끄고 바로 저장한다", () => {
    const t = setup();
    t.c.apply([
      { colId: "b", width: 140 },
      { colId: "a", hide: true },
      { colId: "c", hide: true, flex: 1 },
    ]);
    expect(t.applied[0]).toEqual({
      state: [{ colId: "b", width: 140, flex: null }, { colId: "a" }, { colId: "c", hide: true, flex: 1 }],
      applyOrder: true,
    });
    expect(t.storage.sets).toHaveLength(1);
    expect(t.saved()!.cols.map((c) => c.colId)).toEqual(["b", "a", "c"]);
    expect(t.isLocked()).toBe(true);
  });
  it("reset — 저장값·대기 저장을 지우고 정의 기준으로 되돌린 뒤 너비 가드를 풀고 자동 너비를 다시 부른다", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    t.c.reset();
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 2);
    expect(t.storage.map.has(gridPrefKey("u1", "scr", "main"))).toBe(false);
    expect(t.api.resetColumnState).toHaveBeenCalledTimes(1);
    expect(t.isLocked()).toBe(false);
    expect(t.onReset).toHaveBeenCalledTimes(1);
    expect(t.c.current()).toBeNull();
    expect(t.c.reapply()).toBe(false);
  });
  it("reset — sort 를 끈 그리드는 지금 정렬을 지킨다(서버 조회 조건)", () => {
    const t = setup({ sort: false });
    t.api.set([{ colId: "a", width: 100, sort: "desc", sortIndex: 0 }, { colId: "b", width: 100, sort: null }]);
    t.c.reset();
    expect(t.applied.at(-1)).toEqual({ state: [{ colId: "a", sort: "desc", sortIndex: 0 }] });
  });
});
