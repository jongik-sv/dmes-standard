import { describe, expect, it } from "vitest";

import { decideAreaSearch } from "./area-search";

/** 마스터 코드 관리 조회 영역의 진입 분기 시험 — 사용자 Enter 가 진입 대기 표지를 먼저 가져가지 않아야 한다. */

describe("decideAreaSearch", () => {
  it("진입 대기 중 autoSearch 호출은 진입 분기를 탄다", () => {
    expect(decideAreaSearch("auto", true)).toBe("entry");
  });

  it("진입 대기 중 사용자 Enter(인자 없음)는 진입 분기를 타지 않고 조회 단추와 같게 간다", () => {
    expect(decideAreaSearch(undefined, true)).toBe("user");
  });

  it("진입 분기를 이미 탄 뒤에는 autoSearch 호출도 사용자 조회와 같다", () => {
    expect(decideAreaSearch("auto", false)).toBe("user");
  });

  it("진입 대기가 아닐 때 사용자 Enter 는 사용자 조회다", () => {
    expect(decideAreaSearch(undefined, false)).toBe("user");
  });
});
