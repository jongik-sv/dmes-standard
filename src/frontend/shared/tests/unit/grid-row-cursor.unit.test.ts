import { describe, expect, it } from "vitest";
import { isCursorRow, nextCursorIndex } from "../../src/components/grid/AgDataGrid";

describe("AgDataGrid 행 커서 — nextCursorIndex", () => {
  it("moves one row down and up", () => {
    expect(nextCursorIndex(2, 5, "ArrowDown")).toBe(3);
    expect(nextCursorIndex(2, 5, "ArrowUp")).toBe(1);
  });

  it("starts at the first row when there is no cursor yet", () => {
    expect(nextCursorIndex(-1, 5, "ArrowDown")).toBe(0);
    expect(nextCursorIndex(-1, 5, "ArrowUp")).toBe(0);
  });

  it("stops at the edges instead of wrapping", () => {
    expect(nextCursorIndex(4, 5, "ArrowDown")).toBeNull();
    expect(nextCursorIndex(0, 5, "ArrowUp")).toBeNull();
  });

  it("does nothing on an empty grid", () => {
    expect(nextCursorIndex(-1, 0, "ArrowDown")).toBeNull();
  });

  it("restarts at the first row when the old cursor fell outside the list (re-query shrank it)", () => {
    expect(nextCursorIndex(9, 3, "ArrowDown")).toBe(0);
  });
});

describe("AgDataGrid 행 커서 — isCursorRow", () => {
  it("matches numeric row keys against the string cursor the grid keeps", () => {
    expect(isCursorRow(7, "7")).toBe(true);
    expect(isCursorRow("7", 7)).toBe(true);
  });

  it("does not match when there is no cursor", () => {
    expect(isCursorRow(7, null)).toBe(false);
    expect(isCursorRow(7, undefined)).toBe(false);
    expect(isCursorRow("", "")).toBe(false);
  });

  it("does not match other rows", () => {
    expect(isCursorRow("A-1", "A-2")).toBe(false);
    expect(isCursorRow(undefined, "A-1")).toBe(false);
  });
});
