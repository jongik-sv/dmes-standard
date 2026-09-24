// TSK-05-03 design.md §3.5 — 변경 분류 표(html p-ver 5행)와 전환 방식 라벨.
import { describe, expect, it } from "vitest";
import { CHANGE_CLASS_TABLE, switchModeLabel } from "@/layout/change-class";

describe("change-class", () => {
  it("변경 분류 표는 시안 5행 그대로다", () => {
    expect(CHANGE_CLASS_TABLE.map((r) => r.change)).toEqual([
      "여분을 쪼개 항목 추가", "항목 길이 변경(도메인 길이 변경 포함)", "항목 순서 변경", "헤더 구성 변경, 헤더 추가·제거", "CONST 값 재정의",
    ]);
    expect(CHANGE_CLASS_TABLE.map((r) => r.lengthOffset)).toEqual(["불변", "변함", "변함", "변함", "불변"]);
    expect(CHANGE_CLASS_TABLE.map((r) => r.mode)).toEqual(["SEQUENTIAL", "SIMULTANEOUS", "SIMULTANEOUS", "SIMULTANEOUS", "SEQUENTIAL"]);
  });

  it("전환 방식 라벨", () => {
    expect(switchModeLabel("SEQUENTIAL")).toBe("순차 전환");
    expect(switchModeLabel("SIMULTANEOUS")).toBe("동시 전환");
    expect(switchModeLabel(null)).toBe("-");
    expect(switchModeLabel(undefined)).toBe("-");
  });
});
