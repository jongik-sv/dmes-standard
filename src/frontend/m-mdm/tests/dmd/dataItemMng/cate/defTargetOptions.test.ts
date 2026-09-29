// TSK-07-02 design.md D5 — REGEX defTarget 드롭다운은 그 마루 데이터의 lvlCnt·라벨 있는 attr 로만 제한한다.
import { describe, expect, it } from "vitest";
import { buildDefTargetOptions } from "../../../../pages/dmd/dataItemMng/cate/defTargetOptions";

describe("buildDefTargetOptions", () => {
  it("KEY 는 항상 있고, lvlCnt 만큼 LVLn 이 붙는다", () => {
    const options = buildDefTargetOptions(2, []);
    expect(options.map((o) => o.value)).toEqual(["KEY", "LVL1", "LVL2"]);
  });

  it("lvlCnt 가 0 이면 KEY 만 남는다", () => {
    expect(buildDefTargetOptions(0, []).map((o) => o.value)).toEqual(["KEY"]);
  });

  it("라벨이 있는 attr 번호만 ATTRnn 으로 더해진다(빈 문자열·공백·null 은 제외)", () => {
    const labels = ["국가", null, "", "   ", "속성5"];
    const options = buildDefTargetOptions(0, labels);
    expect(options.map((o) => o.value)).toEqual(["KEY", "ATTR01", "ATTR05"]);
    expect(options.find((o) => o.value === "ATTR01")?.label).toBe("ATTR01(국가)");
  });
});
