/** @vitest-environment happy-dom */
/**
 * 그룹 머리글(GridColumn.children) 그리드의 컬럼 개인화 — 그룹이 갈라지지 않게 한다.
 * (a) 열 정의 marryChildren (b) 설정 창 그룹 제목 줄·같은 그룹 안 이동 (c) 저장값 복원 때 그룹 모으기 (d) api.moveColumns 로 그룹 가르기 거절.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ColGroupDef, GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, buildColumnDefs, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { ColumnSettingsModal, type ColumnSettingsColumn } from "../../src/components/grid/ColumnSettingsModal";
import { gatherGroupedColumns, gridPrefKey, mergeColumnState, type GridPrefs } from "../../src/components/grid/grid-personalize";
import { defaultColumnsFromDefs } from "../../src/components/grid/grid-personalize-hook";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

installMemoryLocalStorage();

const BASE = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };

/** 그룹 둘이 같은 잎 이름(수량·금액)을 갖고, 한 그룹은 중첩 그룹을 품는다. */
const GROUPED: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  {
    key: "plan",
    header: "계획",
    children: [
      { key: "plan_qty", header: "수량", width: 80 },
      { key: "plan_amt", header: "금액", width: 80 },
    ],
  },
  {
    key: "actual",
    header: "실적",
    children: [
      { key: "act_qty", header: "수량", width: 80 },
      { key: "act_amt", header: "금액", width: 80 },
      { key: "act_hide", header: "내부", hide: true },
      { key: "sub", header: "세부", children: [{ key: "sub_a", header: "가", width: 70 }, { key: "sub_b", header: "나", width: 70 }] },
    ],
  },
  { key: "note", header: "비고", width: 100 },
];
const FLAT: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120, editable: true },
  { key: "qty", header: "수량", width: 90, type: "number" },
];

function isGroup(d: ColDef | ColGroupDef): d is ColGroupDef {
  return "children" in d;
}
function allGroups(defs: ReadonlyArray<ColDef | ColGroupDef>): ColGroupDef[] {
  return defs.flatMap((d) => (isGroup(d) ? [d, ...allGroups(d.children)] : []));
}

describe("(a) buildColumnDefs — marryChildren", () => {
  it("모든 열 그룹(중첩 포함)에 marryChildren true 를 준다", () => {
    const groups = allGroups(buildColumnDefs(GROUPED, BASE));
    expect(groups.map((g) => g.groupId)).toEqual(["plan", "actual", "sub"]);
    expect(groups.every((g) => g.marryChildren === true)).toBe(true);
  });

  it("그룹 없는 그리드의 열 정의에는 marryChildren 이 어디에도 없다", () => {
    const defs = buildColumnDefs(FLAT, BASE);
    expect(JSON.stringify(defs)).not.toContain("marryChildren");
    expect(defs.some(isGroup)).toBe(false);
  });

  it("개인화 훅의 기본 컬럼에 잎의 그룹 경로가 담긴다(그룹 없는 잎은 groupPath 없음)", () => {
    const cols = defaultColumnsFromDefs(buildColumnDefs(GROUPED, BASE), false);
    const path = (id: string) => cols.find((c) => c.colId === id)?.groupPath;
    expect(path("code")).toBeUndefined();
    expect(path("plan_qty")).toEqual(["plan"]);
    expect(path("sub_b")).toEqual(["actual", "sub"]);
    expect(path("note")).toBeUndefined();
    expect(Object.keys(defaultColumnsFromDefs(buildColumnDefs(FLAT, BASE), false)[0])).not.toContain("groupPath");
  });
});

describe("(c) gatherGroupedColumns · mergeColumnState — 그룹 모으기", () => {
  const paths: Record<string, string[]> = { pa: ["P"], pb: ["P"], pc: ["P"], qa: ["Q"], qb: ["Q"], na: ["Q", "N"], nb: ["Q", "N"] };
  const pathOf = (id: string) => paths[id];

  it("그룹 잎이 갈라져 있으면 첫 잎 자리로 모으고 그룹 안 순서는 입력 순서를 지킨다", () => {
    expect(gatherGroupedColumns(["pb", "x", "qa", "pa", "y", "pc", "qb"], pathOf)).toEqual(["pb", "pa", "pc", "x", "qa", "qb", "y"]);
  });

  it("중첩 그룹도 바깥·안쪽 모두 붙인다", () => {
    expect(gatherGroupedColumns(["na", "pa", "qa", "nb", "qb"], pathOf)).toEqual(["na", "nb", "qa", "qb", "pa"]);
  });

  it("그룹이 없거나 이미 붙어 있으면 순서가 그대로다", () => {
    expect(gatherGroupedColumns(["c", "a", "b", "d"], () => undefined)).toEqual(["c", "a", "b", "d"]);
    expect(gatherGroupedColumns(["x", "pa", "pb", "pc", "y"], pathOf)).toEqual(["x", "pa", "pb", "pc", "y"]);
  });

  const defaults = [{ colId: "x" }, { colId: "pa", groupPath: ["P"] }, { colId: "pb", groupPath: ["P"] }, { colId: "y" }, { colId: "qa", groupPath: ["Q"] }];
  const prefs = (ids: string[]): GridPrefs => ({ v: 1, savedAt: 1, cols: ids.map((colId) => ({ colId, hide: false, pinned: null })) });

  it("mergeColumnState — 저장 순서가 그룹을 가르면 모아서 돌려준다", () => {
    const state = mergeColumnState(defaults, prefs(["pa", "x", "qa", "pb", "y"]));
    expect(state.map((s) => s.colId)).toEqual(["pa", "pb", "x", "qa", "y"]);
  });

  it("mergeColumnState — 그룹 정보가 없는 기본 컬럼이면 저장 순서를 그대로 쓴다(그룹 없는 그리드 불변)", () => {
    const plain = defaults.map(({ colId }) => ({ colId }));
    expect(mergeColumnState(plain, prefs(["pa", "x", "qa", "pb", "y"])).map((s) => s.colId)).toEqual(["pa", "x", "qa", "pb", "y"]);
  });

  it("mergeColumnState — 새 그룹 잎(저장값에 없음)이 다른 그룹 사이에 끼지 않는다", () => {
    // 저장값은 pb·x·pa 만 안다. 새 잎 pc 는 정의상 pb 뒤이지만 x 건너편이라 갈라지므로 그룹 쪽으로 모인다.
    const d = [{ colId: "pa", groupPath: ["P"] }, { colId: "pb", groupPath: ["P"] }, { colId: "pc", groupPath: ["P"] }, { colId: "x" }];
    expect(mergeColumnState(d, prefs(["pa", "x", "pb"])).map((s) => s.colId)).toEqual(["pa", "pb", "pc", "x"]);
  });
});

// ── 설정 창(제어형, 그리드 없이) ─────────────────────────────────────────────────

const G_PLAN = { id: "plan", header: "계획" };
const G_ACT = { id: "actual", header: "실적" };
const G_SUB = { id: "sub", header: "세부" };
const MODAL_COLS: ColumnSettingsColumn[] = [
  { colId: "code", header: "코드", hide: false },
  { colId: "plan_qty", header: "수량", hide: false, group: G_PLAN, groupPath: [G_PLAN] },
  { colId: "plan_amt", header: "금액", hide: false, group: G_PLAN, groupPath: [G_PLAN] },
  { colId: "act_qty", header: "수량", hide: false, group: G_ACT, groupPath: [G_ACT] },
  { colId: "act_amt", header: "금액", hide: false, group: G_ACT, groupPath: [G_ACT] },
  { colId: "act_hide", header: "내부", hide: true, internal: true, group: G_ACT, groupPath: [G_ACT] },
  { colId: "sub_a", header: "가", hide: false, group: G_SUB, groupPath: [G_ACT, G_SUB] },
  { colId: "sub_b", header: "나", hide: false, group: G_SUB, groupPath: [G_ACT, G_SUB] },
  { colId: "note", header: "비고", hide: false },
];

let r: Rendered | null = null;
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="column-settings-${id}"]`);
const btn = (id: string) => q(id) as HTMLButtonElement;
const click = (el: HTMLElement | null) => act(() => void el!.click());
/** 목록의 줄(제목 줄 `G:id`, 컬럼 줄 id)을 보이는 순서대로. */
const lines = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="column-settings-row-"], [data-testid^="column-settings-group-"]')).map((e) => {
    const t = e.getAttribute("data-testid")!;
    return t.startsWith("column-settings-group-") ? `G:${t.replace("column-settings-group-", "")}` : t.replace("column-settings-row-", "");
  });
const rowIds = () => lines().filter((l) => !l.startsWith("G:"));

function showModal(columns: ColumnSettingsColumn[] = MODAL_COLS) {
  const onApply = vi.fn();
  const el = createElement(ColumnSettingsModal, { opened: true, columns, onApply, onReset: vi.fn(), onClose: vi.fn() });
  if (r) rerender(r, el);
  else r = renderWithMantine(el);
  return { onApply };
}

describe("(b) ColumnSettingsModal — 그룹 제목 줄·같은 그룹 안 이동", () => {
  afterEach(() => {
    r?.unmount();
    r = null;
  });

  it("그룹이 있는 컬럼 앞에 그룹 이름을 제목 줄로 보이고, 같은 이름 컬럼이 그룹으로 구별된다(중첩은 바깥 → 안쪽)", () => {
    showModal();
    expect(lines()).toEqual(["code", "G:plan", "plan_qty", "plan_amt", "G:actual", "act_qty", "act_amt", "G:sub", "sub_a", "sub_b", "note"]);
    expect(q("group-plan")!.textContent).toBe("계획");
    expect(q("group-actual")!.textContent).toBe("실적");
    expect(q("group-sub")!.textContent).toBe("세부");
  });

  it("그룹 정보가 없는 컬럼 목록은 제목 줄이 없다(기존 모양)", () => {
    showModal(MODAL_COLS.map(({ group: _g, groupPath: _p, ...rest }) => rest));
    expect(lines().some((l) => l.startsWith("G:"))).toBe(false);
  });

  it("그룹 경계에서는 위로·아래로 단추가 비활성이고 그룹 밖 컬럼도 그룹 안으로 못 들어간다", () => {
    showModal();
    expect(btn("up-plan_qty").disabled).toBe(true); // 앞이 그룹 밖(code)
    expect(btn("down-plan_qty").disabled).toBe(false);
    expect(btn("up-plan_amt").disabled).toBe(false);
    expect(btn("down-plan_amt").disabled).toBe(true); // 뒤가 다른 그룹(act_qty)
    expect(btn("up-act_qty").disabled).toBe(true);
    expect(btn("down-act_amt").disabled).toBe(true); // 뒤는 중첩 그룹(sub)
    expect(btn("up-sub_a").disabled).toBe(true);
    expect(btn("down-sub_b").disabled).toBe(true);
    expect(btn("up-sub_b").disabled).toBe(false);
    expect(btn("down-code").disabled).toBe(true); // 그룹 밖 → 그룹 안 금지
    expect(btn("up-note").disabled).toBe(true);
  });

  it("같은 그룹 안에서는 옮겨지고, 적용 상태는 모든 컬럼을 그룹이 붙은 순서로 담는다(내부 컬럼 제자리)", () => {
    const { onApply } = showModal();
    click(btn("down-plan_qty"));
    click(btn("up-sub_b"));
    expect(lines()).toEqual(["code", "G:plan", "plan_amt", "plan_qty", "G:actual", "act_qty", "act_amt", "G:sub", "sub_b", "sub_a", "note"]);
    click(q("apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect((onApply.mock.calls[0][0] as Array<{ colId: string }>).map((s) => s.colId)).toEqual([
      "code", "plan_amt", "plan_qty", "act_qty", "act_amt", "act_hide", "sub_b", "sub_a", "note",
    ]);
  });

  it("그룹이 달라도 고정 구역이 같고 둘 다 그룹 밖이면 예전처럼 옮겨진다", () => {
    showModal();
    expect(btn("up-code").disabled).toBe(true); // 맨 앞
    const cols: ColumnSettingsColumn[] = [
      { colId: "a", header: "A", hide: false },
      { colId: "b", header: "B", hide: false },
    ];
    r?.unmount(); // 본체 상태는 열 때 한 번 정해진다 — 새로 연다
    r = null;
    showModal(cols);
    expect(btn("down-a").disabled).toBe(false);
    click(btn("down-a"));
    expect(rowIds()).toEqual(["b", "a"]);
  });
});

// ── 실제 그리드 ──────────────────────────────────────────────────────────────────

const SCREEN = "scr-groups";
const KEY = gridPrefKey("u1", SCREEN, "main");
const DATA = [{ code: "A" }, { code: "B" }];
let spy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(
    TabPageContext.Provider,
    { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } },
    createElement(AgDataGrid, { columns: GROUPED, rowKey: "code", data: DATA, columnSizing: "fixed", height: "auto", ...props }),
  );
}
async function mount(el: ReactElement) {
  await act(async () => void (r = renderWithMantine(el)));
  await wait(150);
}
const api = (): GridApi => {
  for (const ctx of spy.mock.contexts as Array<{ api?: GridApi }>) if (ctx?.api && !ctx.api.isDestroyed()) return ctx.api;
  throw new Error("그리드 api 없음");
};
const order = (a: GridApi) => a.getAllGridColumns().map((c) => c.getColId());
const seed = (ids: string[]) =>
  localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: 1, cols: ids.map((colId) => ({ colId, hide: false, pinned: null })) }));
/** 열 그룹마다 잎이 서로 붙어 있는가. */
function groupsContiguous(ids: string[]): boolean {
  const groups: Record<string, string[]> = {
    plan: ["plan_qty", "plan_amt"],
    actual: ["act_qty", "act_amt", "act_hide", "sub_a", "sub_b"],
    sub: ["sub_a", "sub_b"],
  };
  return Object.values(groups).every((leaves) => {
    const at = leaves.map((l) => ids.indexOf(l));
    return Math.max(...at) - Math.min(...at) === leaves.length - 1;
  });
}
const DEFAULT_ORDER = ["code", "plan_qty", "plan_amt", "act_qty", "act_amt", "act_hide", "sub_a", "sub_b", "note"];
const SPLIT_ORDER = ["act_amt", "note", "plan_amt", "sub_b", "code", "act_qty", "plan_qty", "sub_a", "act_hide"];

describe("그룹 머리글 그리드 — 실제 ag-grid", () => {
  beforeEach(async () => {
    localStorage.clear();
    spy = vi.spyOn(AgGridReact.prototype, "render");
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

  it("기준: 열 정의 순서이고 모든 그룹 정의가 marryChildren 이다", async () => {
    await mount(gridEl());
    expect(order(api())).toEqual(DEFAULT_ORDER);
    const defs = api().getColumnDefs() as Array<ColDef | ColGroupDef>;
    expect(allGroups(defs).every((g) => g.marryChildren === true)).toBe(true);
  });

  it("(d) api.moveColumns 로 잎을 그룹 밖으로 옮기거나 남의 열을 그룹 사이에 끼우려 하면 ag-grid 가 거절한다", async () => {
    await mount(gridEl());
    const a = api();
    act(() => a.moveColumns(["plan_qty"], 4)); // 계획 잎을 실적 사이로
    expect(order(a)).toEqual(DEFAULT_ORDER);
    act(() => a.moveColumns(["note"], 2)); // 남의 열을 계획 두 잎 사이로
    expect(order(a)).toEqual(DEFAULT_ORDER);
    act(() => a.moveColumns(["act_qty"], 0)); // 그룹 밖(맨 앞)으로
    expect(order(a)).toEqual(DEFAULT_ORDER);
    act(() => a.moveColumns(["plan_amt"], 1)); // 같은 그룹 안 교환은 된다
    expect(order(a).slice(1, 3)).toEqual(["plan_amt", "plan_qty"]);
  });

  it("ag-grid 는 그룹을 가르는 applyOrder 를 받으면 순서 전체를 버린다(그래서 병합이 미리 모은다)", async () => {
    await mount(gridEl());
    const a = api();
    act(() => a.applyColumnState({ state: SPLIT_ORDER.map((colId) => ({ colId })), applyOrder: true }));
    expect(order(a)).toEqual(DEFAULT_ORDER);
  });

  it("(c) 그룹을 가르는 저장값을 두고 마운트하면 그룹이 붙은 채 복원된다 — 저장 순서의 나머지도 살아난다", async () => {
    seed(SPLIT_ORDER);
    await mount(gridEl());
    const ids = order(api());
    expect(groupsContiguous(ids)).toBe(true);
    // 각 그룹을 첫 잎 자리로 모은다 — 실적은 act_amt 자리, 그 안에서 저장 순서(act_amt, sub_b, sub_a, act_qty, act_hide) 이고 세부는 sub_b 자리
    expect(ids).toEqual(["act_amt", "sub_b", "sub_a", "act_qty", "act_hide", "note", "plan_amt", "plan_qty", "code"]);
  });

  it("(c) 그룹이 없는 그리드는 저장 순서 그대로 복원된다", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: 1, cols: ["qty", "code", "name"].map((colId) => ({ colId, hide: false, pinned: null })) }),
    );
    await mount(gridEl({ columns: FLAT }));
    expect(order(api())).toEqual(["qty", "code", "name"]);
  });

  it("설정 창: 그룹 제목 줄이 보이고 같은 이름 컬럼이 구별되며, 경계 단추가 비활성이다 — 내부 컬럼은 숨는다", async () => {
    await mount(gridEl());
    // GridPanel 없이 쓰는 그리드라 단추가 없다 — 머리글 우클릭 메뉴로 연다
    const header = document.querySelector(".ag-header-cell[col-id='code']")!;
    act(() => void header.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })));
    await wait(30);
    const item = document.querySelector<HTMLElement>('[data-testid="grid-header-menu-settings"]');
    expect(item).toBeTruthy();
    await click(item);
    await wait(30);
    expect(lines()).toEqual(["code", "G:plan", "plan_qty", "plan_amt", "G:actual", "act_qty", "act_amt", "G:sub", "sub_a", "sub_b", "note"]);
    expect(btn("down-plan_amt").disabled).toBe(true);
    expect(btn("up-act_qty").disabled).toBe(true);
    expect(btn("down-act_amt").disabled).toBe(true);
    // 같은 그룹 안 이동 → 적용하면 그룹이 붙은 채 그리드·저장값에 반영
    await click(btn("down-plan_qty"));
    await click(q("apply"));
    await wait(30);
    const ids = order(api());
    expect(groupsContiguous(ids)).toBe(true);
    expect(ids.slice(1, 3)).toEqual(["plan_amt", "plan_qty"]);
    const saved = JSON.parse(localStorage.getItem(KEY)!) as GridPrefs;
    expect(saved.cols.map((c) => c.colId)).toEqual(ids);
  });
});
