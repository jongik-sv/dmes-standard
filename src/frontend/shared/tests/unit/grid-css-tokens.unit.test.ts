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
