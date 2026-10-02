import { describe, expect, it } from "vitest";
import { withCurrentOption } from "../../src/components/form/select-or-input-options";

describe("SelectOrInput 선택지", () => {
  it("지금 값이 목록에 있으면 목록 그대로", () => {
    expect(withCurrentOption(["A", "B"], "A")).toEqual(["A", "B"]);
  });

  it("지금 값이 목록에 없으면 앞에 둔다", () => {
    expect(withCurrentOption(["A", "B"], "OLD")).toEqual(["OLD", "A", "B"]);
  });

  it("빈 값은 끼우지 않는다", () => {
    expect(withCurrentOption(["A", "B"], "")).toEqual(["A", "B"]);
  });

  it("원본 배열을 돌려주지 않고 복사한다", () => {
    const list = ["A"];
    expect(withCurrentOption(list, "A")).not.toBe(list);
  });
});
