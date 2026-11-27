// 칸 폭 조절(shared resizable-columns) 순수 함수 — 경계 이동 규칙·한계·저장 모양·템플릿.
import { describe, expect, it } from "vitest";

import {
  applySaved, gridTemplate, keyDelta, resizeColumns, resizeTarget, widthsToSaved, type ResizableColumnDef,
} from "../../src/components/resizable-columns";

describe("resizeColumns", () => {
  it("경계 i 의 칸이 px 면 그 칸이, 아니면 i+1 칸이 반대로 바뀐다(합 보존 아님)", () => {
    expect(resizeColumns([300, "fr"], 0, 50)).toEqual([350, "fr"]);
    expect(resizeColumns(["fr", 250], 0, 40)).toEqual(["fr", 210]);
    expect(resizeColumns(["fr", "fr"], 0, 40)).toEqual(["fr", "fr"]);
    expect(resizeTarget(["fr", 250, "fr"], 1)).toBe(1);
    expect(resizeTarget(["fr", 250], 0)).toBe(1);
    expect(resizeTarget(["fr", "fr"], 0)).toBe(-1);
  });

  it("최소(기본 150)·최대(기본 2200)·칸별 최소로 자르고 입력은 바꾸지 않는다", () => {
    const base = [200, "fr", 300] as const;
    expect(resizeColumns(base, 0, -500)).toEqual([150, "fr", 300]);
    expect(resizeColumns(base, 0, 5000)).toEqual([2200, "fr", 300]);
    expect(resizeColumns(base, 0, -100, { mins: [180] })).toEqual([180, "fr", 300]);
    expect(base).toEqual([200, "fr", 300]);
  });
});

describe("저장·템플릿·키", () => {
  const cols: ResizableColumnDef[] = [{ key: "a", width: 300 }, { key: "b", width: "fr" }, { key: "c", width: 250, minWidth: 200 }];

  it("px 칸 중 처음 폭과 다른 것만 저장하고, 없어진 키·fr 칸의 저장값은 무시하며 한계로 자른다", () => {
    expect(widthsToSaved(cols, [320, "fr", 250])).toEqual({ a: { kind: "px", value: 320 } });
    const saved = { a: { kind: "px" as const, value: 400 }, b: { kind: "px" as const, value: 500 }, gone: { kind: "px" as const, value: 700 }, c: { kind: "px" as const, value: 50 } };
    expect(applySaved(cols, saved)).toEqual([400, "fr", 200]);
  });

  it("grid-template-columns 는 칸 사이에 손잡이 칸을 끼우고 fr 은 minmax 로 쓴다", () => {
    expect(gridTemplate([300, "fr", 250])).toBe("300px 10px minmax(0, 1fr) 10px 250px");
    expect(keyDelta("ArrowLeft", false)).toBe(-20);
    expect(keyDelta("ArrowRight", true)).toBe(80);
    expect(keyDelta("Enter", false)).toBeNull();
  });
});
