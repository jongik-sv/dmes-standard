import { describe, expect, it } from "vitest";

import { getViewportForBounds } from "@dk-oasis/shared/react-flow";

import { components, layoutTables, packShelves, wrapRanks } from "../../../pages/dma/erdEdit/canvas/erd-layout";
import type { ErdModelJson } from "../../../pages/dma/erdEdit/types";
import { column, emptyModel, relation, table } from "./erd-fixtures";

/** 부모 1 → 자식 40, 외톨이 16(MCM 모양). 표마다 컬럼 하나. 관계는 자식 → 부모(DB 확정). */
function bigModel(): ErdModelJson {
  const m = emptyModel();
  const add = (id: string, phys: string): void => {
    m.tables[id] = table(phys, phys, [`c-${id}`]);
    m.columns[`c-${id}`] = column(id, "ID", "아이디");
  };
  add("t-p", "TB_MCM_P");
  for (let k = 0; k < 40; k++) {
    add(`t-c${k}`, `TB_MCM_C${String(k).padStart(2, "0")}`);
    m.relations[`r-${k}`] = relation(`t-c${k}`, "t-p", [[`c-t-c${k}`, "c-t-p"]], { state: "DB" });
  }
  for (let k = 0; k < 16; k++) add(`t-i${k}`, `TB_MCM_I${String(k).padStart(2, "0")}`);
  return m;
}

const size = (id: string) => ({ width: 240, height: id.startsWith("t-i") ? 110 : 250 });

interface Box { id: string; x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxesOf = (ids: string[], pos: Record<string, { x: number; y: number }>): Box[] =>
  ids.map((id) => ({ id, x: pos[id].x, y: pos[id].y, w: 240, h: size(id).height }));
const bounds = (boxes: Box[]) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.w)) - x, height: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};

describe("2-D 자동 배치(U23)", () => {
  it("layoutTables2dKeepsAspectAndOrder — 캔버스 비 1.77 에서 가로세로 비 0.88-3.5, 겹침 0, 같은 결과, 부모가 자식 왼쪽", () => {
    const m = bigModel();
    const ids = Object.keys(m.tables);
    const pos = layoutTables(m, ids, size, { x: 0, y: 0 }, 1.77);
    const boxes = boxesOf(ids, pos);
    const b = bounds(boxes);
    expect(b.width / b.height).toBeGreaterThanOrEqual(0.88);
    expect(b.width / b.height).toBeLessThanOrEqual(3.5);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
    expect(layoutTables(m, [...ids].reverse(), size, { x: 0, y: 0 }, 1.77)).toEqual(pos);
    for (let k = 0; k < 40; k++) expect(pos["t-p"].x).toBeLessThan(pos[`t-c${k}`].x);
    for (const p of Object.values(pos)) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
  });

  it("layoutTables — 시작 점을 더하고, 표가 없으면 빈 결과, aspect 가 이상하면 기본 1.6", () => {
    const m = bigModel();
    const ids = Object.keys(m.tables);
    const base = layoutTables(m, ids, size, { x: 0, y: 0 }, 1.77);
    const moved = layoutTables(m, ids, size, { x: 100, y: -50 }, 1.77);
    for (const id of ids) expect(moved[id]).toEqual({ x: base[id].x + 100, y: base[id].y - 50 });
    expect(layoutTables(m, [], size)).toEqual({});
    expect(layoutTables(m, ids, size, { x: 0, y: 0 }, Number.NaN)).toEqual(layoutTables(m, ids, size, { x: 0, y: 0 }, 1.6));
    expect(layoutTables(m, ids, size, { x: 0, y: 0 }, 1.6)).toEqual(layoutTables(m, ids, size));
  });

  it("layoutTables — 캔버스가 넓을수록 결과도 가로로 넓다(비를 따른다)", () => {
    const m = bigModel();
    const ids = Object.keys(m.tables);
    const ratio = (aspect: number): number => {
      const b = bounds(boxesOf(ids, layoutTables(m, ids, size, { x: 0, y: 0 }, aspect)));
      return b.width / b.height;
    };
    expect(ratio(3)).toBeGreaterThan(ratio(1));
  });

  it("fitOf57Is25PercentOrMore — 57개 표를 1018×574 캔버스에 맞추면 배율 0.25 이상", () => {
    const m = bigModel();
    const ids = Object.keys(m.tables);
    expect(ids).toHaveLength(57);
    const b = bounds(boxesOf(ids, layoutTables(m, ids, size, { x: 0, y: 0 }, 1018 / 574)));
    const vp = getViewportForBounds(b, 1018, 574, 0.1, 1, 0.1);
    expect(vp.zoom).toBeGreaterThanOrEqual(0.25);
  });

  it("components — 관계로 이어진 묶음, 물리명 순으로 흔들리지 않음", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const edges = [{ source: "b", target: "a" }, { source: "c", target: "b" }, { source: "e", target: "d" }];
    expect(components(ids, edges)).toEqual([["a", "b", "c"], ["d", "e"], ["f"]]);
    // 선 방향·선 순서·모르는 끝은 결과를 바꾸지 않는다
    const same = components(ids, [{ source: "d", target: "e" }, { source: "a", target: "b" }, { source: "b", target: "c" }, { source: "x", target: "a" }]);
    expect(same).toEqual([["a", "b", "c"], ["d", "e"], ["f"]]);
    // 표 하나짜리 묶음(외톨이)과 빈 입력
    expect(components(["z", "y"], [])).toEqual([["z"], ["y"]]);
    expect(components([], [])).toEqual([]);
    // 묶음 안 순서는 입력 순서, 묶음 순서는 첫 표의 입력 순서
    expect(components(["c", "a", "b"], [{ source: "a", target: "c" }])).toEqual([["c", "a"], ["b"]]);
  });

  it("wrapRanks — 높이 상한을 넘는 층을 옆 열로 나누고 층 순서를 지킨다", () => {
    const sz = () => ({ width: 240, height: 250 });
    // 층 0 = 표 1개(x 0), 층 1 = 표 10개(x 340, 세로로 쌓임)
    const pos: Record<string, { x: number; y: number }> = { p: { x: 0, y: 0 } };
    for (let k = 0; k < 10; k++) pos[`c${k}`] = { x: 340, y: k * 290 };
    // 칸 간격 0: 열 하나에 4개(1000) → 열 3개(4, 4, 2)
    const out = wrapRanks(pos, sz, 1000, 0, 100);
    expect(out.p).toEqual({ x: 0, y: 0 });
    const colsX = [...new Set(Array.from({ length: 10 }, (_, k) => out[`c${k}`].x))].sort((a, b) => a - b);
    expect(colsX).toHaveLength(3);
    expect(colsX[0]).toBe(240 + 100); // 앞 층 폭 + 층 사이
    expect(colsX[1] - colsX[0]).toBe(240); // 같은 층 열 사이 = 열 폭 + 칸 간격 0
    for (const x of colsX) {
      const ys = Array.from({ length: 10 }, (_, k) => out[`c${k}`]).filter((p) => p.x === x).map((p) => p.y).sort((a, b) => a - b);
      expect(ys[0]).toBe(0);
      expect(ys[ys.length - 1] + 250).toBeLessThanOrEqual(1000);
    }
    // 위에서 아래로 입력 y 순이 유지된다(열 안)
    expect(out.c0.y).toBeLessThan(out.c1.y);
    expect(out.c4.x).toBeGreaterThan(out.c0.x);
    // 층 순서: 부모 x < 모든 자식 x, 칸 간격 40 이면 열이 4개(3, 3, 3, 1)
    const gap40 = wrapRanks(pos, sz, 1000, 40, 100);
    const x40 = new Set(Array.from({ length: 10 }, (_, k) => gap40[`c${k}`].x));
    expect(x40.size).toBe(4);
    for (let k = 0; k < 10; k++) expect(gap40.p.x).toBeLessThan(gap40[`c${k}`].x);
    // 높이 상한 안이면 층마다 한 열 그대로 — 왼쪽 위는 (0, 0)
    const small = wrapRanks({ a: { x: 50, y: 70 }, b: { x: 50, y: 400 } }, sz, 10000, 40, 100);
    expect(small).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 290 } });
  });

  it("packShelves — 줄 폭을 넘으면 다음 줄, 큰 상자 먼저", () => {
    const boxes = [
      { id: "s1", w: 100, h: 100 },
      { id: "big", w: 400, h: 300 },
      { id: "s2", w: 100, h: 100 },
      { id: "mid", w: 300, h: 200 },
    ];
    // 줄 폭 800, 칸 간격 60: big(0,0) → mid 는 460 + 300 = 760 이하라 같은 줄 → s1 은 820 + 100 > 800 이라 다음 줄
    const out = packShelves(boxes, 800, 60);
    expect(out.big).toEqual({ x: 0, y: 0 });
    expect(out.mid).toEqual({ x: 460, y: 0 });
    expect(out.s1).toEqual({ x: 0, y: 360 }); // 줄 높이 300 + 60
    expect(out.s2).toEqual({ x: 160, y: 360 });
    // 같은 면적이면 id 순, 입력 순서는 결과를 바꾸지 않는다
    expect(packShelves([...boxes].reverse(), 800, 60)).toEqual(out);
    // 줄 폭보다 큰 상자는 혼자 한 줄
    const wide = packShelves([{ id: "w", w: 2000, h: 100 }, { id: "n", w: 50, h: 50 }], 800, 60);
    expect(wide.w).toEqual({ x: 0, y: 0 });
    expect(wide.n).toEqual({ x: 0, y: 160 });
    expect(packShelves([], 800, 60)).toEqual({});
  });
});
