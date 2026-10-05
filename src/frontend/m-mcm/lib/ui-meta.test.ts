import { describe, expect, it } from "vitest";
import type { GridColumn } from "@dk-oasis/shared/grid";

import { DESCRIPTION_LABEL, SOURCE_LABEL, uiCols } from "./ui-meta";

describe("uiCols", () => {
  it("meta 를 적지 않은 열에 false 를 채우고, 적은 열·사전 key 열은 그대로 둔다", () => {
    const cols: GridColumn[] = [{ key: "a" }, { key: "b", meta: "B_COL" }, { key: "c", meta: false }, { key: "dict" }];
    const out = uiCols(cols, ["dict"]);
    expect(out.map((c) => [c.key, c.meta])).toEqual([
      ["a", false],
      ["b", "B_COL"],
      ["c", false],
      ["dict", undefined],
    ]);
    expect("meta" in out[3]).toBe(false);
  });

  it("열 묶음 안쪽까지 풀고 원본은 바꾸지 않는다", () => {
    const cols: GridColumn[] = [{ key: "g", header: "묶음", children: [{ key: "x" }, { key: "y" }] }];
    const out = uiCols(cols, ["y"]);
    expect(out[0].meta).toBe(false);
    expect(out[0].children?.map((c) => [c.key, c.meta])).toEqual([
      ["x", false],
      ["y", undefined],
    ]);
    expect("meta" in cols[0]).toBe(false);
    expect("meta" in (cols[0].children ?? [])[0]).toBe(false);
  });

  it("열 정의의 다른 속성은 그대로다", () => {
    const render = () => null;
    const [c] = uiCols([{ key: "k", header: "머리", width: 10, render }]);
    expect(c).toEqual({ key: "k", header: "머리", width: 10, render, meta: false });
  });
});

describe("라벨 상수", () => {
  it("설명·원천 라벨은 사전 카드를 끈다", () => {
    expect(DESCRIPTION_LABEL).toEqual({ name: "description", label: "설명", meta: false });
    expect(SOURCE_LABEL).toEqual({ name: "source", label: "원천", meta: false });
  });
});
