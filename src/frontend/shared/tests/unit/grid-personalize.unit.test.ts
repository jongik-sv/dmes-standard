import { describe, expect, it } from "vitest";

import type { GridColumn } from "../../src/components/grid/AgDataGrid";
import {
  GRID_SELECTION_COL_ID,
  clearGridPrefs,
  gridPrefKey,
  hideLockedColIds,
  isColumnHideLocked,
  loadGridPrefs,
  mergeColumnState,
  parseGridPrefs,
  resolvePersonalize,
  saveGridPrefs,
  toGridPrefs,
  type GridDefaultColumn,
  type GridPrefs,
} from "../../src/components/grid/grid-personalize";

/** Map 기반 가짜 Storage. quota 를 넘기면 setItem 이 QuotaExceededError 를 던진다(값 길이 합 기준). */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  constructor(private quota = Number.POSITIVE_INFINITY) {}
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    const used = [...this.map.entries()].reduce((n, [key, val]) => (key === k ? n : n + val.length), 0);
    if (used + v.length > this.quota) {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const prefs = (cols: GridPrefs["cols"], extra: Partial<GridPrefs> = {}): GridPrefs => ({ v: 1, savedAt: 1, cols, ...extra });

describe("resolvePersonalize", () => {
  it("defaults to on with sort", () => {
    expect(resolvePersonalize(undefined)).toEqual({ enabled: true, sort: true });
    expect(resolvePersonalize(true)).toEqual({ enabled: true, sort: true });
  });
  it("false turns everything off, object adjusts sort", () => {
    expect(resolvePersonalize(false)).toEqual({ enabled: false, sort: false });
    expect(resolvePersonalize({ sort: false })).toEqual({ enabled: true, sort: false });
    expect(resolvePersonalize({})).toEqual({ enabled: true, sort: true });
  });
});

describe("gridPrefKey", () => {
  it("builds dmes:grid:v1:{user}:{screen}:{grid} with main default", () => {
    expect(gridPrefKey("u1", "/mcm/a", "detail")).toBe("dmes:grid:v1:u1:/mcm/a:detail");
    expect(gridPrefKey("u1", "/mcm/a")).toBe("dmes:grid:v1:u1:/mcm/a:main");
    expect(gridPrefKey("u1", "/mcm/a", "")).toBe("dmes:grid:v1:u1:/mcm/a:main");
  });
});

describe("parseGridPrefs", () => {
  it("rejects wrong version or shape", () => {
    expect(parseGridPrefs(null)).toBeNull();
    expect(parseGridPrefs({ v: 2, cols: [] })).toBeNull();
    expect(parseGridPrefs({ v: 1 })).toBeNull();
    expect(parseGridPrefs("x")).toBeNull();
  });
  it("drops duplicate colIds, bad widths, bad pinned", () => {
    const p = parseGridPrefs({
      v: 1,
      savedAt: 5,
      cols: [
        { colId: "a", width: 100.4, hide: false, pinned: "left" },
        { colId: "a", width: 999 },
        { colId: "b", width: -3, pinned: "top" },
        { colId: "c", width: Number.NaN },
        { colId: "" },
        { width: 10 },
      ],
      sort: [{ colId: "a", sort: "desc" }, { colId: "a", sort: "asc" }, { colId: "b", sort: "up" }],
    });
    expect(p).toEqual({
      v: 1,
      savedAt: 5,
      cols: [{ colId: "a", width: 100, hide: false, pinned: "left" }, { colId: "b", pinned: null }, { colId: "c" }],
      sort: [{ colId: "a", sort: "desc" }],
    });
  });
});

describe("load/save/clear", () => {
  it("does nothing without a user id", () => {
    const s = new FakeStorage();
    expect(saveGridPrefs("", "/a", "main", prefs([]), s)).toBe(false);
    expect(s.length).toBe(0);
    s.setItem(gridPrefKey("", "/a"), JSON.stringify(prefs([])));
    expect(loadGridPrefs("", "/a", "main", s)).toBeNull();
  });
  it("round-trips and clears", () => {
    const s = new FakeStorage();
    const p = prefs([{ colId: "a", width: 80, hide: true, pinned: null }], { sort: [{ colId: "a", sort: "asc" }] });
    expect(saveGridPrefs("u", "/a", "g", p, s)).toBe(true);
    expect(loadGridPrefs("u", "/a", "g", s)).toEqual(p);
    clearGridPrefs("u", "/a", "g", s);
    expect(loadGridPrefs("u", "/a", "g", s)).toBeNull();
  });
  it("returns null on broken JSON and survives a throwing storage", () => {
    const s = new FakeStorage();
    s.setItem(gridPrefKey("u", "/a"), "{oops");
    expect(loadGridPrefs("u", "/a", "main", s)).toBeNull();
    const throwing = {
      get length(): number {
        throw new Error("denied");
      },
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
      key() {
        throw new Error("denied");
      },
      clear() {},
    } as unknown as Storage;
    expect(loadGridPrefs("u", "/a", "main", throwing)).toBeNull();
    expect(saveGridPrefs("u", "/a", "main", prefs([]), throwing)).toBe(false);
    expect(() => clearGridPrefs("u", "/a", "main", throwing)).not.toThrow();
  });
  const big = (savedAt: number) => JSON.stringify(prefs([{ colId: "x".repeat(40) }], { savedAt }));
  it("on quota prunes exactly the same user's oldest grid key, then retries", () => {
    // 그리드 키 두 개 + 분할 키("{}")까지만 들어간다 — 세 번째 그리드 키는 하나를 지워야 들어간다.
    const s = new FakeStorage(big(1).length * 2 + 10);
    // 새 키를 먼저 넣는다 — 저장소 순서가 아니라 savedAt 순서로 지우는지 본다.
    s.setItem(gridPrefKey("u", "/new"), big(9));
    s.setItem(gridPrefKey("u", "/old"), big(1));
    s.setItem("dmes:split:v1:u:/old", "{}");
    const next = prefs([{ colId: "y".repeat(40) }], { savedAt: 10 });
    expect(saveGridPrefs("u", "/cur", "main", next, s)).toBe(true);
    expect(s.getItem(gridPrefKey("u", "/old"))).toBeNull();
    expect(s.getItem(gridPrefKey("u", "/new"))).not.toBeNull();
    expect(s.getItem("dmes:split:v1:u:/old")).toBe("{}");
    expect(s.length).toBe(3);
  });
  it("prunes only this user's grid keys and gives up quietly when still full", () => {
    const s = new FakeStorage(big(1).length * 2 + 10);
    s.setItem(gridPrefKey("other", "/a"), big(0));
    s.setItem(gridPrefKey("u", "/mine"), big(5));
    s.setItem("dmes:split:v1:u:/x", "{}");
    // 값 하나가 남은 용량보다 커서 같은 사용자 키를 다 지워도 들어가지 않는다.
    const huge = prefs([{ colId: "y".repeat(big(1).length * 2) }]);
    expect(saveGridPrefs("u", "/a", "main", huge, s)).toBe(false);
    expect(s.getItem(gridPrefKey("u", "/mine"))).toBeNull();
    expect(s.getItem(gridPrefKey("other", "/a"))).toBe(big(0));
    expect(s.getItem("dmes:split:v1:u:/x")).toBe("{}");
  });
  it("does not prune when the write fails for a reason other than quota", () => {
    const s = new FakeStorage();
    s.setItem(gridPrefKey("u", "/mine"), big(1));
    s.setItem = () => {
      const err = new Error("denied");
      err.name = "SecurityError";
      throw err;
    };
    expect(saveGridPrefs("u", "/a", "main", prefs([]), s)).toBe(false);
    expect(s.getItem(gridPrefKey("u", "/mine"))).toBe(big(1));
  });
});

describe("hide locks", () => {
  it("locks editable columns unless hideable true, and system columns always", () => {
    const ctx = { rowKey: "id" };
    expect(isColumnHideLocked({ key: "a" }, ctx)).toBe(false);
    expect(isColumnHideLocked({ key: "a", hideable: false }, ctx)).toBe(true);
    expect(isColumnHideLocked({ key: "a", editable: true }, ctx)).toBe(true);
    expect(isColumnHideLocked({ key: "a", editable: () => true }, ctx)).toBe(true);
    expect(isColumnHideLocked({ key: "a", editable: true, hideable: true }, ctx)).toBe(false);
    expect(isColumnHideLocked({ key: "id", hideable: true }, ctx)).toBe(true);
    expect(isColumnHideLocked({ key: "seq", hideable: true }, { rowKey: "id", rowDragField: "seq" })).toBe(true);
    expect(isColumnHideLocked({ key: "h", rowDrag: true, hideable: true }, ctx)).toBe(true);
  });
  it("collects locked leaf ids inside groups plus selection and row number", () => {
    const cols: GridColumn[] = [
      { key: "id" },
      { key: "g", children: [{ key: "q", editable: true }, { key: "r" }] },
      { key: "n" },
    ];
    expect([...hideLockedColIds(cols, { rowKey: "id" })].sort()).toEqual(
      [GRID_SELECTION_COL_ID, "__rowNo", "id", "q"].sort(),
    );
  });
});

describe("mergeColumnState", () => {
  const defs: GridDefaultColumn[] = [
    { colId: "a", width: 100 },
    { colId: "b", width: 100 },
    { colId: "c", width: 100 },
  ];
  const ids = (state: { colId: string }[]) => state.map((s) => s.colId);

  it("uses saved order, width, hide, pinned", () => {
    const out = mergeColumnState(
      defs,
      prefs([
        { colId: "c", width: 50, hide: false, pinned: "left" },
        { colId: "a", width: 70, hide: true, pinned: null },
        { colId: "b" },
      ]),
    );
    expect(out).toEqual([
      { colId: "c", width: 50, flex: null, hide: false, pinned: "left" },
      { colId: "a", width: 70, flex: null, hide: true, pinned: null },
      { colId: "b", width: 100, hide: false, pinned: null },
    ]);
  });
  it("turns flex off only for columns with a saved width (fit grid keeps filling)", () => {
    const fit: GridDefaultColumn[] = [{ colId: "a" }, { colId: "b" }, { colId: "c" }];
    const out = mergeColumnState(fit, prefs([{ colId: "a", width: 140 }, { colId: "b" }, { colId: "c", hide: true }]));
    expect(out.map((s) => [s.colId, s.width, s.flex])).toEqual([
      ["a", 140, null],
      ["b", undefined, undefined],
      ["c", undefined, undefined],
    ]);
    expect("flex" in out[1]).toBe(false);
  });
  it("inserts new columns after their default predecessor (front, middle, end)", () => {
    const d: GridDefaultColumn[] = [{ colId: "n0" }, { colId: "a" }, { colId: "n1" }, { colId: "b" }, { colId: "c" }, { colId: "n2" }];
    const out = mergeColumnState(d, prefs([{ colId: "c" }, { colId: "b" }, { colId: "a" }]));
    // n0 은 앞 컬럼이 없어 맨 앞, n1 은 a 뒤, n2 는 기본 순서상 앞 컬럼인 c 뒤.
    expect(ids(out)).toEqual(["n0", "c", "n2", "b", "a", "n1"]);
  });
  it("keeps consecutive new columns in default order", () => {
    const d: GridDefaultColumn[] = [{ colId: "n0" }, { colId: "n1" }, { colId: "a" }];
    expect(ids(mergeColumnState(d, prefs([{ colId: "a" }])))).toEqual(["n0", "n1", "a"]);
  });
  it("drops removed columns and handles empty or all-new prefs", () => {
    expect(ids(mergeColumnState(defs, prefs([{ colId: "gone" }, { colId: "b" }])))).toEqual(["a", "b", "c"]);
    expect(ids(mergeColumnState(defs, prefs([])))).toEqual(["a", "b", "c"]);
  });
  it("ignores saved hide for locked and definition-hidden columns", () => {
    const d: GridDefaultColumn[] = [{ colId: "a" }, { colId: "internal", hide: true }, { colId: "e" }];
    const out = mergeColumnState(
      d,
      prefs([
        { colId: "a", hide: true },
        { colId: "internal", hide: false },
        { colId: "e", hide: true },
      ]),
      { locked: new Set(["e"]) },
    );
    expect(out.map((s) => [s.colId, s.hide])).toEqual([
      ["a", true],
      ["internal", true],
      ["e", false],
    ]);
  });
  it("keeps selection and row number columns visible through hideLockedColIds", () => {
    const cols: GridColumn[] = [{ key: "id" }, { key: "name" }];
    const d: GridDefaultColumn[] = [{ colId: GRID_SELECTION_COL_ID }, { colId: "__rowNo" }, { colId: "id" }, { colId: "name" }];
    const out = mergeColumnState(
      d,
      prefs([
        { colId: GRID_SELECTION_COL_ID, hide: true },
        { colId: "__rowNo", hide: true },
        { colId: "id", hide: true },
        { colId: "name", hide: true },
      ]),
      { locked: hideLockedColIds(cols, { rowKey: "id" }) },
    );
    expect(out.map((s) => [s.colId, s.hide])).toEqual([
      [GRID_SELECTION_COL_ID, false],
      ["__rowNo", false],
      ["id", false],
      ["name", true],
    ]);
  });
  it("applies sort only when asked and saved", () => {
    const p = prefs([{ colId: "a" }, { colId: "b" }, { colId: "c" }], {
      sort: [{ colId: "c", sort: "desc" }, { colId: "gone", sort: "asc" }, { colId: "a", sort: "asc" }],
    });
    const withSort = mergeColumnState(defs, p, { sort: true });
    expect(withSort.map((s) => [s.colId, s.sort, s.sortIndex])).toEqual([
      ["a", "asc", 1],
      ["b", null, null],
      ["c", "desc", 0],
    ]);
    expect(mergeColumnState(defs, p).every((s) => !("sort" in s))).toBe(true);
    expect(mergeColumnState(defs, prefs([{ colId: "a" }]), { sort: true }).every((s) => !("sort" in s))).toBe(true);
  });
});

describe("toGridPrefs", () => {
  it("captures order, width, hide, pinned and sort by sortIndex", () => {
    const p = toGridPrefs(
      [
        { colId: "b", width: 80.6, hide: false, pinned: "right", sort: "asc", sortIndex: 1 },
        { colId: "a", width: 0, hide: true, pinned: null, sort: "desc", sortIndex: 0 },
        { colId: "c", hide: null, pinned: null, sort: null },
      ],
      { sort: true, now: 42 },
    );
    expect(p).toEqual({
      v: 1,
      savedAt: 42,
      cols: [
        { colId: "b", width: 81, hide: false, pinned: "right" },
        { colId: "a", hide: true, pinned: null },
        { colId: "c", hide: false, pinned: null },
      ],
      sort: [
        { colId: "a", sort: "desc" },
        { colId: "b", sort: "asc" },
      ],
    });
    expect(toGridPrefs([{ colId: "a", sort: "asc" }], { sort: false, now: 1 }).sort).toBeUndefined();
  });
  it("does not save widths of flex columns (only the ones the user resized lose flex)", () => {
    const p = toGridPrefs(
      [
        { colId: "a", width: 150, flex: 2 },
        { colId: "b", width: 120, flex: null },
        { colId: "c", width: 90, flex: 0 },
      ],
      { sort: false, now: 1 },
    );
    expect(p.cols.map((c) => [c.colId, c.width])).toEqual([
      ["a", undefined],
      ["b", 120],
      ["c", 90],
    ]);
  });
});
