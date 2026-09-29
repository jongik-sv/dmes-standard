import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/components/grid/grid.css", import.meta.url), "utf8");

describe("grid.css 토큰화", () => {
  it("primary/danger 색을 하드코딩하지 않는다", () => {
    expect(css).not.toMatch(/#337ab7/i);
    expect(css).not.toMatch(/#2a6499/i);
    expect(css).not.toMatch(/#d9534f/i);
  });
  it("cm-data-grid 와 ag-theme 오버라이드가 남아 있다", () => {
    expect(css).toContain(".cm-data-grid");
    expect(css).toContain("--ag-");
  });
});

// `@dk-oasis/shared/grid.css` 는 grid 진입점이 import 한 CSS 묶음이다. grid.css 를 import 하던 CustomDataGrid 를 지우자
// 묶음에서 그리드 스타일이 통째로 빠졌다(2026-09-29, 의사결정표 적중·실패 표시가 사라짐). 그리드 본체가 직접 import 한다.
describe("grid.css 묶음", () => {
  it("AgDataGrid 가 grid.css 를 import 한다", () => {
    const src = readFileSync(new URL("../../src/components/grid/AgDataGrid.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/^import "\.\/grid\.css";$/m);
  });
});
