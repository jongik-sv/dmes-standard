import { describe, expect, it } from "vitest";
import { canConfirm } from "../../../pages/dme/ruleConfirm/checks";
import { setCheckTitle } from "../../../pages/dme/ruleSetConfirm/checks";

describe("세트 확정 검사 제목", () => {
  it("네 항목과 적용 순서의 제목", () => {
    expect(setCheckTitle("FLOW_STRUCTURE")).toBe("흐름 구조");
    expect(setCheckTitle("RULES_RELEASED")).toBe("참조 룰 RELEASED");
    expect(setCheckTitle("ORDER")).toBe("순서·순환");
    expect(setCheckTitle("TEST_CASES")).toBe("테스트 케이스");
    expect(setCheckTitle("APPLY_FROM")).toBe("적용 순서");
    expect(setCheckTitle("X")).toBe("X");
  });
});

describe("세트 확정 게이트", () => {
  it("첫 버전 세트의 적용 순서 면제(EXEMPT)는 확정을 막지 않는다", () => {
    const items = ["FLOW_STRUCTURE", "RULES_RELEASED", "ORDER", "TEST_CASES"].map((item) => ({ item, status: "PASSED" as const, issues: [] }));
    expect(canConfirm({
      status: "DRAFT", ownerId: "me", me: "me", permitted: true, items,
      applyFromCheck: { status: "EXEMPT", previousApplyFrom: null, message: null },
      checkedApplyFrom: "2026-07-01 00:00:00", applyFrom: "2026-07-01 00:00:00",
    })).toBe(true);
  });
});
