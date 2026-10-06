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
    autoSave: true,
    defaults: [{ colId: "a", width: 100 }, { colId: "b", width: 100 }, { colId: "c", width: 100 }],
    locked: new Set(["a"]),
    ...ctxOver,
  };
  let sized: ReadonlySet<string> = new Set();
  const onReset = vi.fn();
  const onRestored = vi.fn();
  let liveApi: GridPersonalizeApi | null = api as unknown as GridPersonalizeApi;
  const c = createGridPersonalizeController({
    getApi: () => liveApi,
    getContext: () => ctx,
    setSizedColumns: (v) => {
      sized = v;
    },
    onReset,
    onRestored,
    storage,
  });
  return {
    c,
    api,
    applied,
    storage,
    ctx,
    onReset,
    onRestored,
    sized: () => [...sized].sort(),
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
  it("크기 바꾸기·이동은 끌기를 마친 이벤트만, 정렬은 정렬 저장이 켜졌을 때만", () => {
    expect(isPersonalizeSaveEvent({ type: "columnMoved", source: "uiColumnMoved", finished: false }, true)).toBe(false);
    expect(isPersonalizeSaveEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true }, true)).toBe(true);
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
      { colId: "b", groupPath: ["g"] },
      { colId: "c", width: 80, pinned: "right", groupPath: ["g"] },
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
  const col = (id: string) => ({ getColId: () => id });

  it("restore — 저장값이 있으면 병합해 applyOrder 로 적용하고 저장 너비 컬럼만 잠근다(잠긴 컬럼 hide 무시, 저장 너비 컬럼은 flex 끔)", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    expect(t.c.restore()).toBe(true);
    expect(t.sized()).toEqual(["a", "b", "c"]);
    expect(t.onRestored).toHaveBeenCalledTimes(1);
    const p = t.applied[0];
    expect(p.applyOrder).toBe(true);
    expect(p.state!.map((s) => [s.colId, s.width, s.hide, s.pinned, s.sort, s.flex])).toEqual([
      ["c", 150, false, "left", null, null],
      ["a", 80, false, null, null, null],
      ["b", 90, true, null, "desc", null],
    ]);
  });
  it("restore — 저장 너비가 없는 컬럼은 너비를 건드리지 않고 잠그지 않는다(기본 너비로 되돌리지 않음)", () => {
    const t = setup();
    t.storage.map.set(
      gridPrefKey("u1", "scr", "main"),
      JSON.stringify({ v: 1, savedAt: 1, cols: [{ colId: "b", width: 77 }, { colId: "a" }, { colId: "c", hide: true }] }),
    );
    t.c.restore();
    expect(t.applied[0].state!.map((s) => [s.colId, s.width])).toEqual([
      ["b", 77],
      ["a", undefined],
      ["c", undefined],
    ]);
    expect(t.sized()).toEqual(["b"]);
  });
  it("restore — 저장 너비가 하나도 없으면(순서·정렬만) 잠그지 않고 자동 너비 재실행도 부르지 않는다", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify({ v: 1, savedAt: 1, cols: [{ colId: "c" }, { colId: "a" }, { colId: "b" }] }));
    expect(t.c.restore()).toBe(true);
    expect(t.sized()).toEqual([]);
    expect(t.onRestored).not.toHaveBeenCalled();
  });
  it("restore — 저장값이 없거나 사용자 ID·화면 키가 비었거나 꺼져 있으면 읽지도 적용하지도 않는다", () => {
    const t = setup();
    expect(t.c.restore()).toBe(false);
    expect(t.api.applyColumnState).not.toHaveBeenCalled();
    expect(t.sized()).toEqual([]);
    for (const over of [{ userId: "" }, { screenKey: "" }, { active: false }]) {
      const u = setup(over);
      u.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
      u.storage.gets.length = 0;
      expect(u.c.restore()).toBe(false);
      expect(u.storage.gets).toEqual([]);
    }
  });
  it("restore — 저장값이 사라졌으면(끈 동안 다른 그리드가 기본값 복원) 잠금을 비운다", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    expect(t.sized()).toEqual(["a", "b", "c"]);
    t.storage.map.clear();
    expect(t.c.restore()).toBe(false);
    expect(t.sized()).toEqual([]);
    expect(t.c.current()).toBeNull();
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
    expect(t.sized()).toEqual([]);
    t.ctx.defaults = [{ colId: "a" }, { colId: "b" }, { colId: "c" }];
    expect(t.c.reapply()).toBe(true);
    expect(t.applied[0].state!.map((s) => s.colId)).toEqual(["c", "a", "b"]);
  });
  it("reapply — 개인 상태가 없으면 아무것도 하지 않는다(저장값 없는 그리드는 재주입에 손대지 않음)", () => {
    const t = setup();
    expect(t.c.reapply()).toBe(false);
    expect(t.api.applyColumnState).not.toHaveBeenCalled();
  });
  it("UI 이벤트만 debounce 뒤 저장하고, 끝나기 전(finished=false) 이벤트는 저장하지 않는다", () => {
    const t = setup();
    t.c.handleEvent({ type: "columnResized", source: "api", finished: true, columns: [col("a")] });
    t.c.handleEvent({ type: "columnResized", source: "autosizeColumns", finished: true, columns: [col("a")] });
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: false, columns: [col("a")] });
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: false });
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 2);
    expect(t.storage.sets).toEqual([]);
    expect(t.sized()).toEqual([]);

    t.api.set([{ colId: "b", width: 70 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    t.api.set([{ colId: "b", width: 75 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [col("b")] });
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS - 1);
    expect(t.storage.sets).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.storage.sets).toHaveLength(1);
    expect(t.saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["b", 75],
      ["a", undefined],
      ["c", undefined],
    ]);
  });
  it("정렬·이동·숨김·고정은 너비를 새로 담지 않고 잠그지 않는다. 끌어 바꾼 컬럼만 담고, 이미 저장된 너비는 이어 둔다", () => {
    const t = setup();
    t.api.set([{ colId: "a", width: 140, sort: "asc", sortIndex: 0 }, { colId: "b", width: 160 }, { colId: "c", width: 90 }]);
    for (const e of [
      { type: "sortChanged", source: "uiColumnSorted" },
      { type: "columnMoved", source: "uiColumnMoved", finished: true },
      { type: "columnVisible", source: "columnMenu" },
      { type: "columnPinned", source: "uiColumnDragged" },
    ]) {
      t.c.handleEvent(e);
      t.c.flush();
      expect(t.saved()!.cols.every((c) => c.width == null), e.type).toBe(true);
      expect(t.sized(), e.type).toEqual([]);
    }
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [col("c")] });
    t.c.flush();
    expect(t.saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["a", undefined],
      ["b", undefined],
      ["c", 90],
    ]);
    expect(t.sized()).toEqual(["c"]);
    t.api.set([{ colId: "a", width: 141 }, { colId: "b", width: 161 }, { colId: "c", width: 90 }]);
    t.c.handleEvent({ type: "sortChanged", source: "uiColumnSorted" });
    t.c.flush();
    expect(t.saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["a", undefined],
      ["b", undefined],
      ["c", 90],
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
    t.c.handleEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [col("c")] });
    t.api.set(INITIAL.map((s) => ({ ...s }))); // 열 정의 재주입이 정의값·정의 순서로 되돌림
    expect(t.c.reapply()).toBe(true);
    expect(t.api.getColumnState().map((s) => [s.colId, s.width])).toEqual([
      ["c", 120],
      ["a", 100],
      ["b", 100],
    ]);
  });
  it("apply — 설정 창 확인: 잠긴 컬럼 hide 는 버리고, width 를 준 컬럼만 flex 를 끄고 너비를 저장하고 바로 저장한다", () => {
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
    expect(t.saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["b", 140],
      ["a", undefined],
      ["c", undefined],
    ]);
    expect(t.sized()).toEqual(["b"]);
  });
  it("reset — 저장값·대기 저장을 지우고 정의 기준으로 되돌린 뒤 잠금을 비우고 자동 너비를 다시 부른다", () => {
    const t = setup();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    t.c.reset();
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 2);
    expect(t.storage.map.has(gridPrefKey("u1", "scr", "main"))).toBe(false);
    expect(t.api.resetColumnState).toHaveBeenCalledTimes(1);
    expect(t.sized()).toEqual([]);
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

describe("createGridPersonalizeController — 자동 저장 스위치", () => {
  const move = { type: "columnMoved", source: "uiColumnMoved", finished: true };
  const reorder = (t: ReturnType<typeof setup>) => t.api.set([{ colId: "b", width: 100 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);

  it("끄면 UI 이벤트는 저장 0회이고 current 는 갱신된다 — 이어서 reapply 하면 저장하지 않은 상태가 유지된다", () => {
    const t = setup({ autoSave: false });
    reorder(t);
    t.c.handleEvent(move);
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 3);
    t.c.flush();
    expect(t.storage.sets).toEqual([]);
    expect(t.c.current()!.cols.map((c) => c.colId)).toEqual(["b", "a", "c"]);
    // 열 정의 재주입으로 ag-grid 가 정의 순서로 되돌렸다고 본다
    t.api.set(INITIAL.map((s) => ({ ...s })));
    expect(t.c.reapply()).toBe(true);
    expect(t.applied.at(-1)!.state!.map((s) => s.colId)).toEqual(["b", "a", "c"]);
  });

  it("끄면 apply(설정 창 적용)도 저장 0회이고 화면에는 적용한다", () => {
    const t = setup({ autoSave: false });
    t.c.apply([{ colId: "c", hide: false }, { colId: "b", hide: true }, { colId: "a", hide: false }]);
    expect(t.api.applyColumnState).toHaveBeenCalled();
    expect(t.storage.sets).toEqual([]);
    expect(t.c.current()!.cols.map((c) => c.colId)).toEqual(["c", "b", "a"]);
  });

  it("saveNow 는 저장 1회이고 대기 중인 저장·저장 안 한 변경 표시를 비운다", () => {
    const t = setup({ autoSave: false });
    reorder(t);
    t.c.handleEvent(move);
    t.c.saveNow();
    expect(t.storage.sets).toEqual([gridPrefKey("u1", "scr", "main")]);
    expect(t.saved()!.cols.map((c) => c.colId)).toEqual(["b", "a", "c"]);
    // 이제 깨끗하다 — 끔 → 켬 에서 다시 저장하지 않는다
    t.ctx.autoSave = false;
    t.c.setAutoSave(true);
    expect(t.storage.sets).toHaveLength(1);
  });

  it("saveNow — 개인화가 동작 중이 아니면 아무것도 하지 않는다", () => {
    const t = setup({ active: false });
    t.c.saveNow();
    expect(t.storage.sets).toEqual([]);
    const noUser = setup({ userId: "" });
    noUser.c.saveNow();
    expect(noUser.storage.sets).toEqual([]);
  });

  it("끔 → 켬 은 저장 안 한 변경이 있을 때만 저장 1회다", () => {
    const t = setup({ autoSave: false });
    t.c.setAutoSave(true);
    expect(t.storage.sets).toEqual([]);
    t.ctx.autoSave = false;
    reorder(t);
    t.c.handleEvent(move);
    expect(t.storage.sets).toEqual([]);
    t.c.setAutoSave(true);
    expect(t.storage.sets).toHaveLength(1);
    expect(t.saved()!.cols.map((c) => c.colId)).toEqual(["b", "a", "c"]);
  });

  it("켬 → 끔 은 대기 중인 저장을 먼저 쓴다(켜져 있던 동안의 변경은 저장한다)", () => {
    const t = setup();
    reorder(t);
    t.c.handleEvent(move);
    expect(t.storage.sets).toEqual([]);
    t.c.setAutoSave(false);
    expect(t.storage.sets).toHaveLength(1);
    expect(t.saved()!.cols.map((c) => c.colId)).toEqual(["b", "a", "c"]);
    // 대기 시간이 지나도 더 쓰지 않는다
    vi.advanceTimersByTime(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS * 3);
    expect(t.storage.sets).toHaveLength(1);
  });

  it("같은 값으로 바꾸면 아무것도 하지 않는다", () => {
    const t = setup();
    reorder(t);
    t.c.handleEvent(move);
    t.c.setAutoSave(true);
    expect(t.storage.sets).toEqual([]);
  });

  it("reset — 끈 채로도 저장값을 지우고 되돌리며, 저장 안 한 변경 표시도 비운다", () => {
    const t = setup({ autoSave: false });
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    reorder(t);
    t.c.handleEvent(move);
    t.c.reset();
    expect(t.storage.map.has(gridPrefKey("u1", "scr", "main"))).toBe(false);
    expect(t.api.resetColumnState).toHaveBeenCalledTimes(1);
    expect(t.c.current()).toBeNull();
    // 켜도 저장할 것이 없다
    t.c.setAutoSave(true);
    expect(t.storage.sets).toEqual([]);
  });

  it("reset 은 옆 키(스위치 값)를 건드리지 않는다", () => {
    const t = setup({ autoSave: false });
    t.storage.map.set("dmes:grid-opts:v1:u1:scr:main", '{"autoSave":false}');
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.reset();
    expect(t.storage.map.get("dmes:grid-opts:v1:u1:scr:main")).toBe('{"autoSave":false}');
  });

  it("restore — 다른 키로 바뀐 뒤 되돌아오면 저장 안 한 표시가 남지 않아 남의 배치를 저장하지 않는다", () => {
    const t = setup({ autoSave: false, gridId: "a" });
    const keyA = gridPrefKey("u1", "scr", "a");
    const keyB = gridPrefKey("u1", "scr", "b");
    const storedA = JSON.stringify({ ...PREFS, savedAt: 5, cols: [{ colId: "a" }, { colId: "b" }, { colId: "c" }], sort: undefined });
    t.storage.map.set(keyA, storedA);
    t.storage.map.set(keyB, JSON.stringify(PREFS));
    t.c.restore();
    // a 에서 끈 채 바꾼다 → a 가 저장 안 한 변경을 가진다
    t.api.set([{ colId: "b", width: 100 }, { colId: "a", width: 100 }, { colId: "c", width: 100 }]);
    t.c.handleEvent({ type: "columnMoved", source: "uiColumnMoved", finished: true });
    // gridId 가 b 로 바뀌어 복원 → current 는 b 의 저장값
    t.ctx.gridId = "b";
    t.c.restore();
    expect(t.c.current()!.cols.map((c) => c.colId)).toEqual(["c", "a", "b"]);
    // 다시 a 로 돌아오면 a 의 저장값을 쓴다(b 의 배치가 아니다)
    t.ctx.gridId = "a";
    t.c.restore();
    expect(t.c.current()!.cols.map((c) => c.colId)).toEqual(["a", "b", "c"]);
    // 켜도 저장할 것이 없다 — a 의 키에 b 배치가 쓰이지 않는다
    t.c.setAutoSave(true);
    expect(t.storage.sets).toEqual([]);
    expect(t.storage.map.get(keyA)).toBe(storedA);
  });
  it("restore — 끈 채 바꾼 상태가 있으면(숨은 탭이 꺼졌다 켜질 때) 저장값이 아니라 그 상태를 다시 적용한다", () => {
    const t = setup({ autoSave: false });
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    reorder(t);
    t.c.handleEvent(move);
    expect(t.c.restore()).toBe(true);
    expect(t.applied.at(-1)!.state!.map((s) => s.colId)).toEqual(["b", "a", "c"]);
    // 저장하고 나면 다시 저장값을 읽는다
    t.c.saveNow();
    t.storage.map.set(gridPrefKey("u1", "scr", "main"), JSON.stringify(PREFS));
    t.c.restore();
    expect(t.applied.at(-1)!.state!.map((s) => s.colId)).toEqual(["c", "a", "b"]);
  });
});
