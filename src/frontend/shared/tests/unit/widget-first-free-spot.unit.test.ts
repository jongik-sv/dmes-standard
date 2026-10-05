import { describe, expect, it } from "vitest";

import { addItem, firstFreeSpot, placedSizeOf } from "../../src/widget/widget-layout";
import type { WidgetItem, WidgetMeta } from "../../src/widget/types";

const item = (instId: string, x: number, y: number, w: number, h: number, locked = false): WidgetItem => ({
  instId,
  widgetId: "t.a",
  x,
  y,
  w,
  h,
  locked,
  config: null,
});
const meta = (w: number, h: number, extra: Partial<WidgetMeta> = {}): WidgetMeta => ({ id: "t.new", title: "새", defaultSize: { w, h }, ...extra });

describe("firstFreeSpot", () => {
  it("빈 보드면 왼쪽 위(0,0)", () => {
    expect(firstFreeSpot([], { w: 6, h: 6 })).toEqual({ x: 0, y: 0 });
  });

  it("같은 행의 오른쪽이 비어 있으면 그 자리", () => {
    expect(firstFreeSpot([item("a", 0, 0, 6, 6)], { w: 6, h: 6 })).toEqual({ x: 6, y: 0 });
  });

  it("중간에 빈 구멍이 있으면 아래가 아니라 구멍에 들어간다", () => {
    const items = [item("a", 0, 0, 12, 6), item("b", 18, 0, 6, 6), item("c", 0, 6, 24, 6)];
    // 가운데 12~17 칸이 비어 있다.
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 12, y: 0 });
  });

  it("행 우선이다 — 위 행에 들어가면 같은 열이 더 왼쪽인 아래 행보다 먼저 고른다", () => {
    const items = [item("a", 0, 0, 6, 3), item("b", 0, 3, 6, 3)];
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 6, y: 0 });
  });

  it("가로로 안 들어가면 다음 줄로 간다", () => {
    const items = [item("a", 0, 0, 12, 6), item("b", 12, 0, 8, 6)];
    // 남은 폭 4칸 < 6칸
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 0, y: 6 });
  });

  it("높이가 모자란 구멍은 건너뛴다", () => {
    const items = [item("a", 0, 0, 24, 2), item("b", 0, 4, 24, 4)];
    // y 2~3 두 행만 비어 있어 높이 6 은 안 들어간다.
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 0, y: 8 });
    expect(firstFreeSpot(items, { w: 6, h: 2 })).toEqual({ x: 0, y: 2 });
  });

  it("빈 자리가 없을 만큼 꽉 차 있으면 맨 아래 왼쪽", () => {
    const items = [item("a", 0, 0, 24, 5), item("b", 0, 5, 24, 4)];
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 0, y: 9 });
  });

  it("잠긴 위젯도 자리를 차지한 것으로 본다", () => {
    const items = [item("a", 0, 0, 6, 6, true)];
    expect(firstFreeSpot(items, { w: 6, h: 6 })).toEqual({ x: 6, y: 0 });
    expect(firstFreeSpot([item("a", 0, 0, 24, 6, true)], { w: 6, h: 6 })).toEqual({ x: 0, y: 6 });
  });

  it("격자 폭(cols)을 넘는 폭은 cols 로 자른다", () => {
    expect(firstFreeSpot([], { w: 40, h: 4 })).toEqual({ x: 0, y: 0 });
    expect(firstFreeSpot([item("a", 0, 0, 24, 4)], { w: 40, h: 4 })).toEqual({ x: 0, y: 4 });
    expect(firstFreeSpot([item("a", 0, 0, 6, 4)], { w: 6, h: 4 }, 12)).toEqual({ x: 6, y: 0 });
    expect(firstFreeSpot([item("a", 0, 0, 6, 4)], { w: 8, h: 4 }, 12)).toEqual({ x: 0, y: 4 });
  });
});

describe("placedSizeOf", () => {
  it("defaultSize 를 최소·최대와 격자 폭으로 자른다(addItem 이 놓는 크기와 같다)", () => {
    expect(placedSizeOf(meta(6, 6))).toEqual({ w: 6, h: 6 });
    expect(placedSizeOf(meta(30, 6))).toEqual({ w: 24, h: 6 });
    expect(placedSizeOf(meta(2, 2, { minSize: { w: 4, h: 3 } }))).toEqual({ w: 4, h: 3 });
    expect(placedSizeOf(meta(10, 10, { maxSize: { w: 8, h: 5 } }))).toEqual({ w: 8, h: 5 });
  });

  it("addItem 이 실제로 놓은 크기와 일치한다", () => {
    for (const m of [meta(30, 6), meta(2, 2, { minSize: { w: 4, h: 3 } }), meta(10, 10, { maxSize: { w: 8, h: 5 } })]) {
      const placed = addItem([], m.id, m, "n1").find((i) => i.instId === "n1")!;
      expect({ w: placed.w, h: placed.h }).toEqual(placedSizeOf(m));
    }
  });
});

describe("firstFreeSpot 로 addItem 하면 미리 본 자리에 그대로 놓인다", () => {
  const scenarios: Record<string, WidgetItem[]> = {
    빈보드: [],
    "오른쪽 빈 자리": [item("a", 0, 0, 6, 6)],
    "중간 구멍": [item("a", 0, 0, 12, 6), item("b", 18, 0, 6, 6), item("c", 0, 6, 24, 6)],
    "다음 줄": [item("a", 0, 0, 12, 6), item("b", 12, 0, 8, 6)],
    "꽉 참": [item("a", 0, 0, 24, 5), item("b", 0, 5, 24, 4)],
    "잠긴 위젯 아래 구멍": [item("a", 0, 6, 12, 4, true), item("b", 12, 0, 12, 3)],
    "높이가 다른 이웃": [item("a", 0, 0, 6, 10), item("b", 6, 0, 6, 3), item("c", 12, 0, 12, 10)],
  };
  for (const [name, items] of Object.entries(scenarios)) {
    for (const m of [meta(6, 6), meta(12, 4), meta(24, 3), meta(4, 8)]) {
      it(`${name} · ${m.defaultSize.w}×${m.defaultSize.h}`, () => {
        const at = firstFreeSpot(items, placedSizeOf(m));
        const next = addItem(items, m.id, m, "new", at);
        const placed = next.find((i) => i.instId === "new")!;
        expect({ x: placed.x, y: placed.y }).toEqual(at);
        // 기존 위젯은 밀리지 않는다.
        for (const old of items) {
          const now = next.find((i) => i.instId === old.instId)!;
          expect({ x: now.x, y: now.y }).toEqual({ x: old.x, y: old.y });
        }
      });
    }
  }
});
