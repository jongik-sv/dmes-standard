import { describe, expect, it } from "vitest";

import { FIRST_FIT_MIN_ZOOM, firstDiagram, initialViewport, nodeOutside } from "../../../pages/dma/erdEdit/state/viewport";

const box = (x: number, y: number, w = 240, h = 200) => ({ x, y, width: w, height: h });

describe("첫 viewport(U22)", () => {
  it("저장 viewport 가 있으면 그것", () => {
    expect(initialViewport([box(0, 0)], { width: 1000, height: 600 }, { x: 5, y: 6, zoom: 0.7 })).toEqual({ x: 5, y: 6, zoom: 0.7 });
  });
  it("맞춤 배율이 문턱 이상이면 맞춤", () => {
    const vp = initialViewport([box(0, 0), box(300, 0)], { width: 1000, height: 600 }, null);
    expect(vp.zoom).toBeGreaterThanOrEqual(FIRST_FIT_MIN_ZOOM);
    expect(vp.zoom).toBeLessThanOrEqual(1);
  });
  it("맞춤 배율이 문턱 미만이면 배율 1, 묶음 왼쪽 위를 40px 안쪽에", () => {
    const many = Array.from({ length: 60 }, (_, i) => box((i % 10) * 300, Math.floor(i / 10) * 1200 + 2762));
    expect(initialViewport(many, { width: 1000, height: 600 }, null)).toEqual({ x: 40, y: 40 - 2762, zoom: 1 });
  });
  it("노드가 없으면 원점 배율 1", () => {
    expect(initialViewport([], { width: 1000, height: 600 }, null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("캔버스 폭이 바뀐 뒤 고른 노드(U12)", () => {
  it("화면 밖이면 true", () => {
    expect(nodeOutside({ x: 0, y: 0, zoom: 1 }, { width: 600, height: 400 }, box(700, 10))).toBe(true);
    expect(nodeOutside({ x: 0, y: 0, zoom: 1 }, { width: 600, height: 400 }, box(100, 10))).toBe(false);
  });
});

describe("첫 다이어그램(U53)", () => {
  const ds = [
    { id: "d-all", sortSeq: 0, tables: 57 }, { id: "d-sec", sortSeq: 1, tables: 12 }, { id: "d-job", sortSeq: 2, tables: 20 },
  ];
  it("기억한 다이어그램이 살아 있으면 그것", () => expect(firstDiagram(ds, "d-job")).toBe("d-job"));
  it("없으면 sortSeq 순 30개 이하 첫 것", () => expect(firstDiagram(ds, "d-gone")).toBe("d-sec"));
  it("작은 것이 없으면 sortSeq 첫 것", () => expect(firstDiagram([ds[0]], null)).toBe("d-all"));
  it("다이어그램이 없으면 null", () => expect(firstDiagram([], null)).toBeNull());
});
