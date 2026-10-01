// 캔버스 노드·선 배열의 구조적 공유(reuse.ts) — 내용이 같은 항목은 이전 참조를 그대로 쓴다(Local-Rules §19).
import { describe, expect, it } from "vitest";

import { reuseById, sameValue } from "../../../pages/dme/ruleSetEdit/canvas/reuse";

const onOpen = () => {};
/** 캔버스 nodes memo 가 만드는 것과 같은 모양 — 렌더마다 모든 칸을 새 객체로 만든다. */
function nodeOf(id: string, over: { x?: number; selected?: boolean; w?: number } = {}) {
  return {
    id, type: "rsfFlow", position: { x: over.x ?? 0, y: 10 }, width: over.w ?? 232, height: 68, measured: { width: over.w ?? 232, height: 68 },
    handles: [{ id: "in", type: "target", x: 1, y: 2 }, { id: "out", type: "source", x: 3, y: 4 }],
    data: { node: { id, kind: "RULE" }, selected: over.selected ?? false, onOpenRule: onOpen, collapsed: null, style: undefined },
    draggable: true, selected: over.selected ?? false,
  };
}

describe("sameValue", () => {
  it("평범한 객체·배열은 칸마다 견주고, 함수·Set 은 참조로만 견준다", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { a: 1, b: [1, { c: 2 }] }, 3)).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined }, 3)).toBe(false);
    expect(sameValue([1, 2], { 0: 1, 1: 2 }, 3)).toBe(false);
    expect(sameValue({ f: () => 1 }, { f: () => 1 }, 3)).toBe(false);
    expect(sameValue(new Set([1]), new Set([1]), 3)).toBe(false);
    expect(sameValue(NaN, NaN, 0)).toBe(true);
  });

  it("깊이를 넘는 다른 참조는 다르다고 본다(재사용만 놓치고 틀리지 않는다)", () => {
    expect(sameValue({ a: { b: 1 } }, { a: { b: 1 } }, 1)).toBe(false);
    expect(sameValue({ a: { b: 1 } }, { a: { b: 1 } }, 2)).toBe(true);
  });
});

describe("reuseById", () => {
  it("노드 하나만 바뀐 입력에서 나머지 노드는 이전 객체를 그대로 쓴다", () => {
    const prev = ["a", "b", "c"].map((id) => nodeOf(id));
    const next = ["a", "b", "c"].map((id) => nodeOf(id, id === "b" ? { x: 50 } : {}));
    const out = reuseById(prev, next);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toBe(next[1]);
    expect(out[1].position.x).toBe(50);
    expect(out[2]).toBe(prev[2]);
  });

  it("선택(data.selected)·크기(measured)만 바뀌어도 그 노드는 새 객체다", () => {
    const prev = ["a", "b"].map((id) => nodeOf(id));
    const sel = reuseById(prev, ["a", "b"].map((id) => nodeOf(id, { selected: id === "a" })));
    expect(sel[0]).not.toBe(prev[0]);
    expect(sel[0].data.selected).toBe(true);
    expect(sel[1]).toBe(prev[1]);
    const grown = reuseById(prev, ["a", "b"].map((id) => nodeOf(id, id === "b" ? { w: 300 } : {})));
    expect(grown[1].measured).toEqual({ width: 300, height: 68 });
    expect(grown[0]).toBe(prev[0]);
  });

  it("모두 같으면 이전 배열 자체를 돌려준다. 추가·삭제·순서 바뀜은 새 배열이고 남은 항목은 재사용한다", () => {
    const prev = ["a", "b"].map((id) => nodeOf(id));
    expect(reuseById(prev, ["a", "b"].map((id) => nodeOf(id)))).toBe(prev);
    const added = reuseById(prev, ["a", "b", "c"].map((id) => nodeOf(id)));
    expect(added).not.toBe(prev);
    expect(added[0]).toBe(prev[0]);
    const swapped = reuseById(prev, ["b", "a"].map((id) => nodeOf(id)));
    expect(swapped).not.toBe(prev);
    expect(swapped[0]).toBe(prev[1]);
    expect(swapped[1]).toBe(prev[0]);
    const removed = reuseById(prev, [nodeOf("a")]);
    expect(removed).toEqual([prev[0]]);
    expect(removed).not.toBe(prev);
  });

  it("이전 배열이 없으면 새 배열을 그대로 쓴다", () => {
    const next = [nodeOf("a")];
    expect(reuseById(null, next)).toBe(next);
  });
});
