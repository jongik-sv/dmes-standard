import { describe, expect, it } from "vitest";

import { DEFAULT_GRID_METRICS, gridBoxPx, snapGridSize } from "../../src/components/grid-resize-box/grid-size";

describe("gridBoxPx", () => {
  it("폭 = 영역 × w/24, 높이 = h×20 + (h−1)×8", () => {
    expect(gridBoxPx(480, { w: 12, h: 10 })).toEqual({ width: 240, height: 272 });
    expect(gridBoxPx(480, { w: 30, h: 1 })).toEqual({ width: 480, height: 20 });
    expect(gridBoxPx(0, { w: 8, h: 6 })).toEqual({ width: 0, height: 160 });
  });

  it("규격은 위젯 보드(24·20·8)가 기본이다", () => {
    expect(DEFAULT_GRID_METRICS).toEqual({ cols: 24, rowHeight: 20, gap: 8 });
  });
});

describe("snapGridSize", () => {
  it("gridBoxPx 의 역 — 칸 크기를 픽셀로 바꿨다가 되돌리면 같은 크기", () => {
    for (const size of [{ w: 1, h: 1 }, { w: 12, h: 8 }, { w: 24, h: 30 }, { w: 7, h: 13 }]) {
      expect(snapGridSize(480, gridBoxPx(480, size))).toEqual(size);
    }
  });

  it("가장 가까운 칸에 맞춘다", () => {
    // 영역 480 → 한 열 20px, 한 행 28px(20+8)
    expect(snapGridSize(480, { width: 249, height: 100 })).toEqual({ w: 12, h: 4 });
    expect(snapGridSize(480, { width: 251, height: 120 })).toEqual({ w: 13, h: 5 });
  });

  it("가로는 1~24 로 제한한다", () => {
    expect(snapGridSize(480, { width: -50, height: 20 }).w).toBe(1);
    expect(snapGridSize(480, { width: 9999, height: 20 }).w).toBe(24);
  });

  it("세로는 1 이상이고 위로 막히지 않는다", () => {
    expect(snapGridSize(480, { width: 100, height: -30 }).h).toBe(1);
    expect(snapGridSize(480, { width: 100, height: 28 * 40 }).h).toBe(40);
  });

  it("limits 로 범위를 줄인다(가로는 24 를 넘지 못한다)", () => {
    const limits = { minW: 4, maxW: 20, minH: 3, maxH: 10 };
    expect(snapGridSize(480, { width: 20, height: 20 }, limits)).toEqual({ w: 4, h: 3 });
    expect(snapGridSize(480, { width: 480, height: 999 }, limits)).toEqual({ w: 20, h: 10 });
    expect(snapGridSize(480, { width: 480, height: 20 }, { maxW: 99 }).w).toBe(24);
  });

  it("영역 폭이 0 이하이면 가로 하한을 돌려준다", () => {
    expect(snapGridSize(0, { width: 100, height: 20 }, { minW: 3 }).w).toBe(3);
  });
});
