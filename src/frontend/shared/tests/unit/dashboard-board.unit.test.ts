/** @vitest-environment happy-dom */

// 대시보드 보드(위젯 배치) — 순수 상태 함수(행 안·행 간 이동, 새 행, 빈 행 제거, 숨김·추가, 키보드 이동, 저장·병합·초기화,
// 놓을 자리 계산)와 보드 컴포넌트(편집 모드 표시, 키보드 이동·초점 복귀, 숨기기·위젯 추가, 행 접기, 저장 복원).
// 포인터 끌기는 happy-dom 에 배치 계산이 없어 시험하지 않고, 같은 계산 함수(computeDropTarget)를 사각형으로 시험한다.
import { act, createElement as h, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/portal-shell/use-user-button-rbac", () => ({
  useUserButtonRbac: () => ({ userId: "u1" }),
  peekLastUserId: () => "u1",
}));

import {
  DashboardBoard,
  DashboardCard,
  DashboardGrid,
  DashboardWidgetPicker,
  useDashboardBoard,
  type DashboardBoardApi,
  type DashboardBoardDefaultRow,
  type DashboardBoardState,
  type DashboardWidget,
} from "../../src/components/dashboard";
import {
  addWidget,
  boardFromDefaults,
  boardsEqual,
  computeDropTarget,
  hideWidget,
  keyboardMove,
  loadBoard,
  moveWidget,
  normalizeBoard,
  sanitizeBoard,
  saveBoard,
  setItemSize,
  setRowCollapsed,
  type DropRowRect,
} from "../../src/components/dashboard/board-state";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
Object.defineProperty(window, "localStorage", { value: ls, configurable: true });

/* ── 순수 함수 ── */

const SPANS: Record<string, number> = { a: 8, b: 4, c: 6, d: 6, e: 12, f: 4 };
const spanOf = (id: string) => SPANS[id] ?? 12;
const DEFAULTS: DashboardBoardDefaultRow[] = [
  { id: "top", widgets: ["a", "b"] },
  { id: "mid", widgets: ["c", "d"] },
  { id: "low", widgets: ["e"] },
];
const IDS = ["a", "b", "c", "d", "e"];
const base = () => boardFromDefaults(DEFAULTS, IDS);
const ids = (s: DashboardBoardState) => s.rows.map((r) => r.items.map((it) => it.id));

describe("보드 상태 — 기본 배치", () => {
  it("기본 배치로 행을 만들고, 모르는 ID·중복은 버리며 기본 배치에 없는 위젯은 숨김이다", () => {
    const s = boardFromDefaults(
      [
        { id: "top", widgets: ["a", "zz", "b", "a"] },
        { id: "empty", widgets: ["zz"] },
      ],
      ["a", "b", "f"]
    );
    expect(ids(s)).toEqual([["a", "b"]]);
    expect(s.rows[0].id).toBe("top");
    expect(s.hidden).toEqual(["f"]);
  });
});

describe("보드 상태 — 옮기기", () => {
  it("같은 행 안에서 순서를 바꾼다(index 는 끄는 위젯을 뺀 뒤의 자리)", () => {
    const s = moveWidget(base(), "a", { kind: "row", rowId: "top", index: 1 });
    expect(ids(s)[0]).toEqual(["b", "a"]);
    // 제자리면 같은 상태
    const b = base();
    expect(moveWidget(b, "a", { kind: "row", rowId: "top", index: 0 })).toBe(b);
  });

  it("다른 행으로 옮기고, 비게 된 행은 없앤다", () => {
    const s = moveWidget(base(), "e", { kind: "row", rowId: "top", index: 1 });
    expect(ids(s)).toEqual([
      ["a", "e", "b"],
      ["c", "d"],
    ]);
    expect(s.rows.map((r) => r.id)).toEqual(["top", "mid"]);
  });

  it("행 사이에 놓으면 새 행을 만든다(혼자 있는 행의 바로 위·아래는 그대로)", () => {
    const s = moveWidget(base(), "b", { kind: "newRow", rowIndex: 1 });
    expect(ids(s)).toEqual([["a"], ["b"], ["c", "d"], ["e"]]);
    expect(new Set(s.rows.map((r) => r.id)).size).toBe(4);
    const b = base();
    expect(moveWidget(b, "e", { kind: "newRow", rowIndex: 2 })).toBe(b);
    expect(moveWidget(b, "e", { kind: "newRow", rowIndex: 3 })).toBe(b);
    // 혼자 있는 위젯을 맨 위 새 행으로
    expect(ids(moveWidget(b, "e", { kind: "newRow", rowIndex: 0 }))).toEqual([
      ["e"],
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("옮겨도 사용자 크기는 따라간다", () => {
    const sized = setItemSize(base(), "a", { span: 5, height: 300 });
    const s = moveWidget(sized, "a", { kind: "row", rowId: "mid", index: 2 });
    expect(s.rows[1].items[2]).toEqual({ id: "a", span: 5, height: 300 });
  });
});

describe("보드 상태 — 키보드 이동", () => {
  it("←→ 는 같은 행 안 한 칸, 끝에서는 그대로", () => {
    const b = base();
    expect(ids(keyboardMove(b, "a", "right"))[0]).toEqual(["b", "a"]);
    expect(keyboardMove(b, "a", "left")).toBe(b);
    expect(keyboardMove(b, "b", "right")).toBe(b);
  });

  it("↑ 는 위 행 끝, ↓ 는 아래 행 앞으로 간다", () => {
    expect(ids(keyboardMove(base(), "c", "up"))).toEqual([["a", "b", "c"], ["d"], ["e"]]);
    expect(ids(keyboardMove(base(), "b", "down"))).toEqual([["a"], ["b", "c", "d"], ["e"]]);
  });

  it("맨 위·아래 행에서는 다른 위젯이 있으면 새 행으로 떼어 내고, 혼자면 그대로", () => {
    expect(ids(keyboardMove(base(), "a", "up"))).toEqual([["a"], ["b"], ["c", "d"], ["e"]]);
    const b = base();
    expect(keyboardMove(b, "e", "down")).toBe(b);
  });

  it("Shift+↑↓ 는 바로 위·아래에 새 행을 만든다", () => {
    expect(ids(keyboardMove(base(), "d", "newRowAbove"))).toEqual([
      ["a", "b"],
      ["d"],
      ["c"],
      ["e"],
    ]);
    expect(ids(keyboardMove(base(), "c", "newRowBelow"))).toEqual([
      ["a", "b"],
      ["d"],
      ["c"],
      ["e"],
    ]);
  });
});

describe("보드 상태 — 숨김·추가", () => {
  it("숨기면 행에서 빠지고(빈 행 제거) 숨김 목록에 들어간다. 크기는 버린다", () => {
    const s = hideWidget(setItemSize(base(), "e", { height: 500 }), "e");
    expect(ids(s)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(s.hidden).toEqual(["e"]);
    const back = addWidget(s, "e", spanOf);
    expect(back.rows[2].items[0]).toEqual({ id: "e" });
  });

  it("다시 놓을 때 마지막 행 칸이 남으면 그 끝에, 모자라면 새 행에 놓는다", () => {
    let s = hideWidget(base(), "b"); // top: a(8)
    s = hideWidget(s, "e"); // 마지막 행 = mid: c(6)+d(6)=12
    s = addWidget(s, "b", spanOf); // 4칸 → 모자람 → 새 행
    expect(ids(s)).toEqual([["a"], ["c", "d"], ["b"]]);
    s = hideWidget(s, "a");
    s = addWidget(s, "a", spanOf); // 마지막 행 b(4)+a(8)=12 → 같은 행
    expect(ids(s)).toEqual([
      ["c", "d"],
      ["b", "a"],
    ]);
  });

  it("접힌 마지막 행에 붙이면 그 행을 펼친다", () => {
    let s = hideWidget(base(), "b");
    s = hideWidget(s, "e");
    s = hideWidget(s, "d"); // 마지막 행 mid: c(6)
    s = setRowCollapsed(s, "mid", true);
    s = addWidget(s, "d", spanOf);
    expect(s.rows[1].items.map((it) => it.id)).toEqual(["c", "d"]);
    expect(s.rows[1].collapsed).toBeUndefined();
  });

  it("숨기지 않은 위젯은 추가하지 않는다", () => {
    const b = base();
    expect(addWidget(b, "a", spanOf)).toBe(b);
  });
});

describe("보드 상태 — 저장·검증·병합", () => {
  beforeEach(() => mem.clear());

  it("v3 형식으로 저장하고 다시 읽는다. 기본 배치(null)면 지운다", () => {
    const s = setRowCollapsed(setItemSize(hideWidget(base(), "b"), "a", { span: 6 }), "mid", true);
    saveBoard("u1", "home", s);
    const raw = JSON.parse(mem.get("dmes:dash:v3:u1:home")!);
    expect(raw.v).toBe(3);
    expect(boardsEqual(loadBoard("u1", "home")!, s)).toBe(true);
    expect(loadBoard("u2", "home")).toBeNull();
    saveBoard("u1", "home", null);
    expect(mem.has("dmes:dash:v3:u1:home")).toBe(false);
  });

  it("다른 버전·깨진 값은 읽지 않고, 항목 안의 잘못된 값만 버린다", () => {
    expect(sanitizeBoard({ v: 2, rows: [] })).toBeNull();
    expect(sanitizeBoard("x")).toBeNull();
    mem.set("dmes:dash:v3:u1:home", "{not json");
    expect(loadBoard("u1", "home")).toBeNull();
    const s = sanitizeBoard({
      v: 3,
      rows: [
        {
          id: "r",
          collapsed: "yes",
          items: [{ id: "a", span: 13, height: -1 }, { id: "b", span: 4, height: 300.4 }, 7],
        },
        { items: [] },
      ],
      hidden: ["c", 5, ""],
    })!;
    expect(s.rows).toEqual([{ id: "r", items: [{ id: "a" }, { id: "b", span: 4, height: 300 }] }]);
    expect(s.hidden).toEqual(["c"]);
  });

  it("사라진 위젯·중복은 버리고, 새 위젯은 기본 배치 행(없으면 마지막 행 끝·새 행)에 붙인다", () => {
    const saved: DashboardBoardState = {
      rows: [
        { id: "mid", items: [{ id: "c" }, { id: "gone" }, { id: "a" }] },
        { id: "x", items: [{ id: "a" }, { id: "gone2" }] },
      ],
      hidden: ["d", "gone3"],
    };
    // b(기본 top 행 — 저장값에 없음), e(기본 low 행 — 저장값에 없음)
    const s = normalizeBoard(saved, IDS, DEFAULTS, spanOf);
    expect(ids(s)).toEqual([["c", "a"], ["b"], ["e"]]);
    expect(s.hidden).toEqual(["d"]);
    // 기본 배치 행이 저장값에 남아 있으면 그 행 끝에 붙인다
    const s2 = normalizeBoard(
      { rows: [{ id: "top", items: [{ id: "a" }] }], hidden: ["c", "d", "e"] },
      IDS,
      DEFAULTS,
      spanOf
    );
    expect(ids(s2)).toEqual([["a", "b"]]);
  });

  it("사용자가 숨긴 위젯과 기본 배치에 없는 새 위젯은 숨김으로 남는다", () => {
    const s = normalizeBoard(
      { rows: [{ id: "top", items: [{ id: "a" }] }], hidden: ["b"] },
      ["a", "b", "f"],
      [{ id: "top", widgets: ["a", "b"] }],
      spanOf
    );
    expect(ids(s)).toEqual([["a"]]);
    expect(s.hidden).toEqual(["b", "f"]);
  });
});

describe("놓을 자리 계산(computeDropTarget)", () => {
  // 행 top: a(0~800) b(808~1200), y 0~100 / 행 mid: c d, y 140~300
  const rows: DropRowRect[] = [
    {
      id: "top",
      left: 0,
      right: 1200,
      top: 0,
      bottom: 100,
      cards: [
        { id: "a", left: 0, right: 800, top: 0, bottom: 100 },
        { id: "b", left: 808, right: 1200, top: 0, bottom: 100 },
      ],
    },
    {
      id: "mid",
      left: 0,
      right: 1200,
      top: 140,
      bottom: 300,
      cards: [
        { id: "c", left: 0, right: 596, top: 140, bottom: 300 },
        { id: "d", left: 604, right: 1200, top: 140, bottom: 300 },
      ],
    },
  ];

  it("다른 행 카드의 왼쪽 반이면 그 앞, 오른쪽 반이면 그 뒤", () => {
    expect(computeDropTarget(100, 200, rows, "a")?.target).toEqual({
      kind: "row",
      rowId: "mid",
      index: 0,
    });
    expect(computeDropTarget(1000, 200, rows, "a")?.target).toEqual({
      kind: "row",
      rowId: "mid",
      index: 2,
    });
    const r = computeDropTarget(700, 200, rows, "a")!;
    expect(r.target).toEqual({ kind: "row", rowId: "mid", index: 1 });
    expect(r.indicator).toMatchObject({ kind: "line", dir: "v", x: 600, length: 160 });
  });

  it("같은 행 안 — 자기 자리면 null, 뒤로 가면 끄는 위젯을 뺀 index", () => {
    expect(computeDropTarget(100, 50, rows, "a")).toBeNull();
    expect(computeDropTarget(700, 50, rows, "a")).toBeNull(); // b 앞 = 제자리
    expect(computeDropTarget(1100, 50, rows, "a")?.target).toEqual({
      kind: "row",
      rowId: "top",
      index: 1,
    });
  });

  it("행 사이·첫 행 위·마지막 행 아래는 새 행", () => {
    expect(computeDropTarget(100, 120, rows, "c")).toEqual({
      target: { kind: "newRow", rowIndex: 1 },
      indicator: { kind: "gap", rowIndex: 1 },
    });
    expect(computeDropTarget(100, -10, rows, "c")?.target).toEqual({ kind: "newRow", rowIndex: 0 });
    expect(computeDropTarget(100, 400, rows, "c")?.target).toEqual({ kind: "newRow", rowIndex: 2 });
  });

  it("혼자 있는 행의 바로 위·아래 새 행은 제자리라 null", () => {
    const solo: DropRowRect[] = [rows[0], { ...rows[1], cards: [rows[1].cards[0]] }];
    expect(computeDropTarget(100, 120, solo, "c")).toBeNull();
    expect(computeDropTarget(100, 400, solo, "c")).toBeNull();
  });

  it("한 줄에 카드가 하나뿐이면(좁은 화면 세로 쌓기) 세로 가운데로 앞뒤를 고른다", () => {
    const stacked: DropRowRect[] = [
      {
        id: "top",
        left: 0,
        right: 600,
        top: 0,
        bottom: 408,
        cards: [
          { id: "a", left: 0, right: 600, top: 0, bottom: 200 },
          { id: "b", left: 0, right: 600, top: 208, bottom: 408 },
        ],
      },
      {
        id: "mid",
        left: 0,
        right: 600,
        top: 448,
        bottom: 600,
        cards: [{ id: "c", left: 0, right: 600, top: 448, bottom: 600 }],
      },
    ];
    expect(computeDropTarget(300, 250, stacked, "c")?.target).toEqual({
      kind: "row",
      rowId: "top",
      index: 1,
    });
    const after = computeDropTarget(300, 380, stacked, "c")!;
    expect(after.target).toEqual({ kind: "row", rowId: "top", index: 2 });
    expect(after.indicator).toMatchObject({ kind: "line", dir: "h", length: 600 });
    // 카드 사이 간격(200~208)은 가까운 줄로
    expect(computeDropTarget(300, 204, stacked, "c")?.target.kind).toBe("row");
  });
});

/* ── 컴포넌트 ── */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mem.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
const click = (el: Element | null) => act(() => (el as HTMLElement).click());
function key(el: Element | null, k: string, shift = false) {
  act(() => {
    el!.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true }));
  });
}
const rowWidgets = () =>
  $$(".cm-dash-board-row").map((r) =>
    Array.from(r.querySelectorAll<HTMLElement>("[data-widget-id]")).map((c) => c.dataset.widgetId)
  );
const card = (id: string) => $(`[data-widget-id="${id}"]`)!;

function makeWidgets(extra?: string): DashboardWidget[] {
  const list: DashboardWidget[] = [
    {
      id: "a",
      title: "가",
      description: "가 설명",
      span: 8,
      render: () => h(DashboardCard, { title: "가" }, extra ?? "본문 가"),
    },
    {
      id: "b",
      title: "나",
      span: 4,
      height: 300,
      render: () => h(DashboardCard, { title: "나" }, "본문 나"),
    },
    { id: "c", title: "다", span: 12, render: () => h(DashboardCard, { title: "다" }, "본문 다") },
    {
      id: "k",
      title: "고정",
      span: 12,
      hideable: false,
      resizable: false,
      render: () => h(DashboardCard, { title: "고정" }),
    },
  ];
  return list;
}
const ROWS: DashboardBoardDefaultRow[] = [
  { id: "r1", widgets: ["a", "b"] },
  { id: "r2", widgets: ["c"] },
  { id: "r3", widgets: ["k"] },
];

let api: DashboardBoardApi;
function Home({
  layoutKey = "t.home",
  widgets = makeWidgets(),
}: {
  layoutKey?: string;
  widgets?: DashboardWidget[];
}) {
  const board = useDashboardBoard({ widgets, defaultRows: ROWS, layoutKey });
  api = board;
  return h(
    DashboardGrid,
    { fill: true },
    h(
      "div",
      { className: "controls" },
      h(
        "button",
        { type: "button", className: "edit", onClick: () => board.setEditing(!board.editing) },
        board.editing ? "완료" : "배치 편집"
      ),
      board.editing &&
        h(DashboardWidgetPicker, {
          board,
          testId: "picker",
          renderTrigger: (t) =>
            h(
              "button",
              {
                type: "button",
                className: "add",
                onClick: t.onClick,
                "aria-expanded": t["aria-expanded"],
                "aria-haspopup": t["aria-haspopup"],
                "aria-controls": t["aria-controls"],
              },
              `위젯 추가 ${t.count}`
            ),
        })
    ),
    h(DashboardBoard, { board })
  );
}
const render = (el: ReactNode) => act(() => root.render(el));

describe("DashboardBoard — 편집 모드", () => {
  it("평소에는 끌기·크기·숨기기 손잡이와 새 행 자리가 없고, 편집 모드에서만 보인다(점선 표시)", () => {
    render(h(Home));
    expect(rowWidgets()).toEqual([["a", "b"], ["c"], ["k"]]);
    expect($$(".cm-dash-card__drag")).toHaveLength(0);
    expect($$(".cm-dash-card__hide")).toHaveLength(0);
    expect($$(".cm-dash-card__resize")).toHaveLength(0);
    expect($$(".cm-dash-board__gap")).toHaveLength(0);
    // 행 접기는 평소에도 있다
    expect($$(".cm-dash-card__toggle")).toHaveLength(4);

    click($(".edit"));
    expect(card("a").dataset.editing).toBe("true");
    expect($$(".cm-dash-card__drag")).toHaveLength(4);
    expect($$(".cm-dash-card__hide")).toHaveLength(3); // k 는 hideable=false
    expect(card("a").querySelectorAll(".cm-dash-card__resize")).toHaveLength(2);
    expect(card("k").querySelectorAll(".cm-dash-card__resize")).toHaveLength(0);
    expect($$(".cm-dash-board__gap").map((g) => g.dataset.gapIndex)).toEqual(["0", "1", "2", "3"]);
    expect($(".cm-dash-card__drag")!.getAttribute("aria-label")).toBe("가 옮기기");
    expect(
      document.getElementById($(".cm-dash-card__drag")!.getAttribute("aria-describedby")!)
        ?.textContent
    ).toContain("방향키");
  });

  it("위젯 정의의 크기를 쓴다(span·height)", () => {
    render(h(Home));
    expect(card("a").dataset.span).toBe("8");
    expect(card("b").style.height).toBe("300px");
  });

  it("방향키로 옮기면 상태·저장이 바뀌고 다시 마운트된 카드 손잡이로 초점이 돌아온다", () => {
    render(h(Home));
    click($(".edit"));
    key(card("a").querySelector(".cm-dash-card__drag"), "ArrowDown");
    expect(rowWidgets()).toEqual([["b"], ["a", "c"], ["k"]]);
    expect(document.activeElement).toBe(card("a").querySelector(".cm-dash-card__drag"));
    expect($('[role="status"]')!.textContent).toContain("가: 2번째 줄 1번째 자리로 옮겼습니다");
    const saved = JSON.parse(mem.get("dmes:dash:v3:u1:t.home")!);
    expect(saved.rows.map((r: { items: { id: string }[] }) => r.items.map((i) => i.id))).toEqual([
      ["b"],
      ["a", "c"],
      ["k"],
    ]);

    key(card("a").querySelector(".cm-dash-card__drag"), "ArrowRight");
    expect(rowWidgets()[1]).toEqual(["c", "a"]);
    key(card("a").querySelector(".cm-dash-card__drag"), "ArrowRight");
    expect($('[role="status"]')!.textContent).toContain("더 옮길 수 없습니다");
    key(card("a").querySelector(".cm-dash-card__drag"), "ArrowUp", true);
    expect(rowWidgets()).toEqual([["b"], ["a"], ["c"], ["k"]]);
    expect(document.activeElement).toBe(card("a").querySelector(".cm-dash-card__drag"));
  });

  it("숨기기 → [위젯 추가] 목록에 이름·설명이 나오고, 고르면 마지막 행 끝(모자라면 새 행)에 다시 놓인다", () => {
    render(h(Home));
    click($(".edit"));
    expect($(".add")!.textContent).toBe("위젯 추가 0");
    click(card("a").querySelector(".cm-dash-card__hide"));
    expect(rowWidgets()).toEqual([["b"], ["c"], ["k"]]);
    expect(document.activeElement).toBe(card("b").querySelector(".cm-dash-card__drag"));
    expect($(".add")!.textContent).toBe("위젯 추가 1");

    click($(".add"));
    expect($(".add")!.getAttribute("aria-expanded")).toBe("true");
    const opt = $('[data-widget-option="a"]')!;
    expect(opt.textContent).toContain("가");
    expect(opt.textContent).toContain("가 설명");
    expect(document.activeElement).toBe(opt);
    click(opt);
    expect($('[data-testid="picker"]')).toBeNull();
    // 마지막 행 k(12칸) + a(8칸) > 12 → 새 행
    expect(rowWidgets()).toEqual([["b"], ["c"], ["k"], ["a"]]);
    expect(document.activeElement).toBe(card("a").querySelector(".cm-dash-card__drag"));
  });

  it("위젯 추가 목록은 Escape 로 닫고 여는 버튼으로 초점을 돌린다. 숨긴 위젯이 없으면 안내만 보인다", () => {
    render(h(Home));
    click($(".edit"));
    click($(".add"));
    expect($('[data-testid="picker"]')!.textContent).toContain("숨긴 위젯이 없습니다");
    key($('[data-testid="picker"]'), "Escape");
    expect($('[data-testid="picker"]')).toBeNull();
    expect(document.activeElement).toBe($(".add"));
  });

  it("행 접기는 편집 모드와 상관없이 행 전체를 접고, 저장된다", () => {
    render(h(Home));
    click(card("b").querySelector(".cm-dash-card__toggle:not(.cm-dash-card__hide)"));
    expect(card("a").dataset.collapsed).toBe("true");
    expect(card("b").dataset.collapsed).toBe("true");
    expect(card("c").dataset.collapsed).toBeUndefined();
    const saved = JSON.parse(mem.get("dmes:dash:v3:u1:t.home")!);
    expect(saved.rows[0].collapsed).toBe(true);
    click($(".edit"));
    expect(card("a").querySelectorAll(".cm-dash-card__resize")).toHaveLength(0); // 접힌 행은 손잡이 없음
    click(card("a").querySelector('[aria-label="이 줄 펼치기"]'));
    expect(card("a").dataset.collapsed).toBeUndefined();
  });

  it("편집 모드 크기 조절은 저장되고, 저장값으로 다시 열면 배치·크기·숨김이 되살아난다", () => {
    render(h(Home));
    click($(".edit"));
    key(card("a").querySelector(".cm-dash-card__resize--x"), "ArrowLeft");
    expect(card("a").dataset.span).toBe("7");
    click(card("c").querySelector(".cm-dash-card__hide"));
    act(() => root.unmount());
    root = createRoot(host);
    render(h(Home));
    expect(rowWidgets()).toEqual([["a", "b"], ["k"]]);
    expect(card("a").dataset.span).toBe("7");
    expect(api.hiddenWidgets.map((w) => w.id)).toEqual(["c"]);
    expect(api.customized).toBe(true);
  });

  it("v2 저장값은 무시하고, 배치 초기화는 기본 배치로 되돌리고 저장값을 지운다", () => {
    mem.set(
      "dmes:dash:v2:u1:t.home",
      JSON.stringify({ a: { span: 3 }, "row:r1": { collapsed: true } })
    );
    render(h(Home));
    expect(card("a").dataset.span).toBe("8");
    expect(card("a").dataset.collapsed).toBeUndefined();
    expect(api.customized).toBe(false);
    click($(".edit"));
    key(card("c").querySelector(".cm-dash-card__drag"), "ArrowUp");
    expect(api.customized).toBe(true);
    act(() => api.reset());
    expect(rowWidgets()).toEqual([["a", "b"], ["c"], ["k"]]);
    expect(mem.has("dmes:dash:v3:u1:t.home")).toBe(false);
    expect(api.customized).toBe(false);
  });

  it("코드에 새 위젯이 생기면 저장된 배치에 붙이고, 사라진 위젯 ID 는 버린다", () => {
    mem.set(
      "dmes:dash:v3:u1:t.home",
      JSON.stringify({
        v: 3,
        rows: [
          { id: "r2", items: [{ id: "c" }, { id: "old" }] },
          { id: "r1", items: [{ id: "a" }] },
        ],
        hidden: ["k"],
      })
    );
    render(h(Home));
    // b 는 저장값에 없는 새 위젯 → 기본 행 r1 끝
    expect(rowWidgets()).toEqual([["c"], ["a", "b"]]);
    expect(api.hiddenWidgets.map((w) => w.id)).toEqual(["k"]);
  });

  it("reveal 은 숨긴 위젯을 다시 놓고 접힌 행을 펼친다", () => {
    render(h(Home));
    click($(".edit"));
    click(card("a").querySelector(".cm-dash-card__hide"));
    click($(".edit"));
    act(() => api.reveal("a"));
    expect(rowWidgets().flat()).toContain("a");
    act(() => api.setRowCollapsed("r2", true));
    act(() => api.reveal("c"));
    expect(card("c").dataset.collapsed).toBeUndefined();
  });

  it("그리는 함수는 늘 최신 위젯 목록에서 부른다", () => {
    function Live() {
      const [n, setN] = useState(0);
      return h(
        "div",
        null,
        h("button", { type: "button", className: "inc", onClick: () => setN(n + 1) }, "+"),
        h(Home, { widgets: makeWidgets(`카운트 ${n}`) })
      );
    }
    render(h(Live));
    expect(card("a").textContent).toContain("카운트 0");
    click($(".inc"));
    expect(card("a").textContent).toContain("카운트 1");
  });

  it("없는 행으로 옮기면 그대로이고, 놓인 위젯이 없으면 안내를 보인다", () => {
    render(h(Home));
    expect(api.move("k", { kind: "row", rowId: "x", index: 0 })).toBe(false);
    act(() => {
      for (const id of ["a", "b", "c", "k"]) api.hide(id);
    });
    expect(rowWidgets()).toEqual([]);
    expect($(".cm-dash-board__empty")!.textContent).toContain("표시할 위젯이 없습니다");
  });
});

describe("KpiTileGroup", () => {
  it("기본 최소 폭 150px·auto-fit 으로 12칸 위젯에서 6개가 한 줄에 놓이고, 좁은 타일은 컨테이너 질의로 추이 선을 값 아래로 내린다", async () => {
    const { KpiTileGroup, KpiTile } = await import("../../src/components/dashboard");
    const { DASHBOARD_CSS } = await import("../../src/components/dashboard/styles");
    render(
      h(
        KpiTileGroup,
        { ariaLabel: "주요 지표", testId: "g" },
        h(KpiTile, { label: "가", value: "1" })
      )
    );
    const g = $('[data-testid="g"]')!;
    expect(g.style.getPropertyValue("--cm-kpi-min")).toBe("150px");
    expect(g.getAttribute("role")).toBe("group");
    expect(DASHBOARD_CSS).toContain("repeat(auto-fit, minmax(var(--cm-kpi-min, 150px), 1fr))");
    expect(DASHBOARD_CSS).toMatch(
      /@container \(max-width: 210px\)[\s\S]*\.cm-kpi__main \{ flex-direction: column/
    );
  });
});
