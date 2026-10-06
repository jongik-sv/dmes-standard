import { describe, expect, it } from "vitest";

import {
  addItem,
  canAddWidget,
  colsForWidth,
  homeTab,
  itemsEqual,
  moveByKey,
  newInstanceId,
  nextTabId,
  reflowLayout,
  removeItem,
  sanitizeLayout,
  tabsEqual,
  toggleLock,
  validateTabName,
  validateWidgetMeta,
} from "../../src/widget/widget-layout";
import type { WidgetItem, WidgetMeta, WidgetRegistry, WidgetTab } from "../../src/widget/types";

const meta = (id: string, w = 6, h = 6, extra: Partial<WidgetMeta> = {}): WidgetMeta => ({
  id,
  title: id,
  defaultSize: { w, h },
  ...extra,
});
const REG: WidgetRegistry = {
  "t.a": { meta: meta("t.a"), load: async () => ({ default: () => null }) },
  "t.b": { meta: meta("t.b", 8, 10, { minSize: { w: 6, h: 8 } }), load: async () => ({ default: () => null }) },
  "t.one": { meta: meta("t.one", 6, 6, { multiple: false }), load: async () => ({ default: () => null }) },
};
const it_ = (instId: string, widgetId: string, x: number, y: number, w: number, h: number, locked = false): WidgetItem => ({
  instId, widgetId, x, y, w, h, locked, config: null,
});

/** 두 위젯이 겹치는지. */
function overlaps(a: WidgetItem, b: WidgetItem) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function assertNoOverlap(items: WidgetItem[]) {
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1) expect(overlaps(items[i], items[j]), `${items[i].instId}↔${items[j].instId}`).toBe(false);
}

describe("colsForWidth", () => {
  it("960 이상 24칸, 768 이상 12칸, 그 아래 1칸", () => {
    expect(colsForWidth(1440)).toBe(24);
    expect(colsForWidth(960)).toBe(24);
    expect(colsForWidth(959)).toBe(12);
    expect(colsForWidth(768)).toBe(12);
    expect(colsForWidth(767)).toBe(1);
  });
});

describe("validateWidgetMeta", () => {
  it("기본 크기가 최소·최대 밖이면 문제를 돌려준다", () => {
    expect(validateWidgetMeta(meta("t.ok", 6, 6))).toEqual([]);
    expect(validateWidgetMeta(meta("t.small", 2, 6))).toHaveLength(1);
    expect(validateWidgetMeta(meta("t.big", 30, 6))).toHaveLength(1);
    expect(validateWidgetMeta(meta("bad id", 6, 6))).toHaveLength(1);
  });
});

describe("sanitizeLayout", () => {
  it("격자 밖 좌표를 안으로 자르고 겹침을 위로 당김으로 푼다", () => {
    const out = sanitizeLayout(
      [it_("a", "t.a", 22, 0, 6, 6), it_("b", "t.a", 0, 0, 6, 6), it_("c", "t.a", 0, 0, 6, 6)],
      REG
    );
    expect(out).toHaveLength(3);
    for (const i of out) {
      expect(i.x).toBeGreaterThanOrEqual(0);
      expect(i.x + i.w).toBeLessThanOrEqual(24);
    }
    assertNoOverlap(out);
  });

  it("최소 크기보다 작으면 최소로 키우고, 정수가 아닌 값·NaN 을 정리한다", () => {
    const out = sanitizeLayout([it_("b", "t.b", 1.6, Number.NaN, 2, 3)], REG);
    expect(out[0]).toMatchObject({ x: 2, y: 0, w: 6, h: 8 });
  });

  it("같은 instId 는 처음 것만 남긴다", () => {
    const out = sanitizeLayout([it_("a", "t.a", 0, 0, 6, 6), it_("a", "t.a", 6, 0, 6, 6)], REG);
    expect(out.map((i) => i.instId)).toEqual(["a"]);
  });

  it("등록부에 없는 위젯은 지우지 않고 크기만 1~24 로 자른다", () => {
    const out = sanitizeLayout([it_("x", "gone.widget", 0, 0, 40, 0)], REG);
    expect(out[0]).toMatchObject({ widgetId: "gone.widget", w: 24, h: 1 });
  });

  it("잠긴 위젯은 당김에도 자리를 지킨다", () => {
    const out = sanitizeLayout([it_("l", "t.a", 0, 10, 6, 6, true), it_("a", "t.a", 6, 30, 6, 6)], REG);
    expect(out.find((i) => i.instId === "l")).toMatchObject({ x: 0, y: 10 });
    expect(out.find((i) => i.instId === "a")!.y).toBe(0);
  });
});

describe("reflowLayout", () => {
  const wide = [it_("a", "t.a", 0, 0, 12, 6), it_("b", "t.a", 12, 0, 12, 6), it_("c", "t.a", 0, 6, 24, 6)];
  it("24칸이면 그대로", () => {
    expect(reflowLayout(wide, 24)).toEqual(wide);
  });
  it("12칸이면 x·w 를 절반으로 줄이고 겹치지 않는다", () => {
    const out = reflowLayout(wide, 12);
    expect(out.find((i) => i.instId === "a")).toMatchObject({ x: 0, w: 6 });
    expect(out.find((i) => i.instId === "b")).toMatchObject({ x: 6, w: 6 });
    expect(out.find((i) => i.instId === "c")).toMatchObject({ x: 0, w: 12 });
    assertNoOverlap(out);
  });
  it("1칸이면 위→아래·왼→오른 순서로 한 줄씩 쌓는다", () => {
    const out = reflowLayout(wide, 1);
    expect(out.map((i) => [i.instId, i.x, i.y, i.w])).toEqual([
      ["a", 0, 0, 1],
      ["b", 0, 6, 1],
      ["c", 0, 12, 1],
    ]);
  });
});

describe("addItem · removeItem · toggleLock · canAddWidget", () => {
  it("자리를 주지 않으면 맨 아래 왼쪽에 기본 크기로 놓는다", () => {
    const out = addItem([it_("a", "t.a", 0, 0, 24, 6)], "t.b", REG["t.b"].meta, "n1");
    expect(out.find((i) => i.instId === "n1")).toMatchObject({ x: 0, y: 6, w: 8, h: 10, locked: false, config: null });
  });
  it("자리를 주면 그 자리에 놓고 겹치는 위젯을 밀어낸다", () => {
    const out = addItem([it_("a", "t.a", 0, 0, 6, 6)], "t.a", REG["t.a"].meta, "n1", { x: 0, y: 0 });
    assertNoOverlap(out);
    expect(out.find((i) => i.instId === "n1")).toMatchObject({ x: 0, y: 0 });
  });
  it("잠긴 위젯은 빼지 않는다", () => {
    const items = [it_("l", "t.a", 0, 0, 6, 6, true)];
    expect(removeItem(items, "l")).toEqual(items);
    expect(removeItem([it_("a", "t.a", 0, 0, 6, 6)], "a")).toEqual([]);
  });
  it("잠금을 뒤집는다", () => {
    expect(toggleLock([it_("a", "t.a", 0, 0, 6, 6)], "a")[0].locked).toBe(true);
  });
  it("multiple:false 위젯이 이미 있거나 30개면 더 놓을 수 없다", () => {
    expect(canAddWidget([it_("o", "t.one", 0, 0, 6, 6)], REG["t.one"].meta)).toBe(false);
    expect(canAddWidget([], REG["t.one"].meta)).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => it_(`w${i}`, "t.a", 0, i * 6, 6, 6));
    expect(canAddWidget(many, REG["t.a"].meta)).toBe(false);
  });
  it("배치가 B(업무 화면만)인 위젯은 새로 놓을 수 없고 W·A 는 놓을 수 있다", () => {
    expect(canAddWidget([], { ...REG["t.a"].meta, placement: "B" })).toBe(false);
    expect(canAddWidget([], { ...REG["t.a"].meta, placement: "W" })).toBe(true);
    expect(canAddWidget([], { ...REG["t.a"].meta, placement: "A" })).toBe(true);
  });
});

describe("moveByKey", () => {
  const base = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 0, 6, 6, 6)];
  it("←→ 는 한 칸 옮기고 격자 밖으로 나가지 않는다", () => {
    expect(moveByKey(base, "a", "right", "move", REG).find((i) => i.instId === "a")!.x).toBe(1);
    expect(moveByKey(base, "a", "left", "move", REG).find((i) => i.instId === "a")!.x).toBe(0);
  });
  it("↓ 는 아래 위젯과 위아래 순서를 바꾼다", () => {
    const out = moveByKey(base, "a", "down", "move", REG);
    expect(out.find((i) => i.instId === "b")!.y).toBeLessThan(out.find((i) => i.instId === "a")!.y);
    assertNoOverlap(out);
  });
  it("↑ 는 위 위젯과 위아래 순서를 바꾼다", () => {
    const out = moveByKey(base, "b", "up", "move", REG);
    expect(out.find((i) => i.instId === "b")!.y).toBeLessThan(out.find((i) => i.instId === "a")!.y);
    assertNoOverlap(out);
  });
  it("resize 는 폭·높이를 한 칸 바꾸고 최소 크기 아래로 내려가지 않는다", () => {
    expect(moveByKey(base, "a", "right", "resize", REG).find((i) => i.instId === "a")!.w).toBe(7);
    const small = [it_("b2", "t.b", 0, 0, 6, 8)];
    expect(moveByKey(small, "b2", "left", "resize", REG)[0].w).toBe(6);
    expect(moveByKey(small, "b2", "up", "resize", REG)[0].h).toBe(8);
  });
  it("↑ 는 x 가 다른 위 위젯과도 순서를 바꾼다", () => {
    const items = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 3, 6, 6, 6)];
    const out = moveByKey(items, "b", "up", "move", REG);
    expect(out.find((i) => i.instId === "b")!.y).toBeLessThan(out.find((i) => i.instId === "a")!.y);
    assertNoOverlap(out);
  });
  it("같은 줄 이웃 쪽으로 →/← 하면 이동 위젯이 그 자리로 가고 겹치지 않는다", () => {
    const row = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 6, 0, 6, 6)];
    const right = moveByKey(row, "a", "right", "move", REG);
    expect(right.find((i) => i.instId === "a")).toMatchObject({ x: 1, y: 0 });
    assertNoOverlap(right);
    const left = moveByKey(row, "b", "left", "move", REG);
    expect(left.find((i) => i.instId === "b")).toMatchObject({ x: 5, y: 0 });
    assertNoOverlap(left);
  });
  it("잠긴 위젯은 움직이지 않는다", () => {
    const locked = [it_("l", "t.a", 0, 0, 6, 6, true)];
    expect(moveByKey(locked, "l", "right", "move", REG)).toEqual(locked);
  });
});

describe("비교·탭 도우미", () => {
  const tab = (tabId: string, name: string, items: WidgetItem[] = []): WidgetTab => ({ tabId, name, seq: 1, locked: false, items });
  it("itemsEqual 은 순서와 상관없이 같은 배치를 같다고 본다", () => {
    const a = [it_("a", "t.a", 0, 0, 6, 6), it_("b", "t.a", 6, 0, 6, 6)];
    expect(itemsEqual(a, [a[1], a[0]])).toBe(true);
    expect(itemsEqual(a, [a[0], { ...a[1], x: 7 }])).toBe(false);
  });
  it("tabsEqual 은 이름·잠금·배치를 비교한다", () => {
    expect(tabsEqual(tab("tab-1", "가"), tab("tab-1", "가"))).toBe(true);
    expect(tabsEqual(tab("tab-1", "가"), tab("tab-1", "나"))).toBe(false);
  });
  it("validateTabName 은 빈 이름·20자 초과·중복을 거른다", () => {
    const tabs = [tab("home", "홈"), tab("tab-1", "내 생산")];
    expect(validateTabName("  ", tabs, "tab-2")).toBe("탭 이름을 입력해 주세요.");
    expect(validateTabName("가".repeat(21), tabs, "tab-2")).toBe("탭 이름은 20자 이하로 정합니다.");
    expect(validateTabName("내 생산", tabs, "tab-2")).toBe("같은 이름의 탭이 있습니다.");
    expect(validateTabName("내 생산", tabs, "tab-1")).toBeNull();
    expect(validateTabName("품질", tabs, "tab-2")).toBeNull();
  });
  it("nextTabId 는 쓰지 않은 tab-n 을 고른다", () => {
    expect(nextTabId([tab("home", "홈"), tab("tab-1", "a"), tab("tab-3", "b")])).toBe("tab-2");
  });
  it("newInstanceId 는 40자 이하이고 겹치지 않는다", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newInstanceId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(40);
  });
  it("homeTab 은 홈 탭을 만든다", () => {
    expect(homeTab([])).toEqual({ tabId: "home", name: "홈", seq: 0, locked: false, items: [] });
  });
});
