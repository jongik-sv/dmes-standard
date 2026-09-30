// TSK-07-02 design.md D5 — REGEX defTarget 드롭다운은 그 마루 데이터의 lvlCnt·라벨 있는 attr 로만 제한한다.
// 저장은 키(KEY·LVL1·ATTRnn)로 하고 화면에는 그 칸의 이름(키·1차·국가)을 보여준다.
import { describe, expect, it } from "vitest";
import { buildDefTargetOptions } from "../../../../pages/dmd/dataItemMng/cate/defTargetOptions";

describe("buildDefTargetOptions", () => {
  it("KEY 는 항상 있고, lvlCnt 만큼 LVLn 이 붙는다", () => {
    const options = buildDefTargetOptions(2, []);
    expect(options.map((o) => o.value)).toEqual(["KEY", "LVL1", "LVL2"]);
  });

  it("KEY·LVLn 은 사람이 읽는 이름(키·1차·2차)으로 보인다", () => {
    expect(buildDefTargetOptions(2, []).map((o) => o.label)).toEqual(["키", "1차", "2차"]);
  });

  it("lvlCnt 가 0 이면 KEY 만 남는다", () => {
    expect(buildDefTargetOptions(0, []).map((o) => o.value)).toEqual(["KEY"]);
  });

  it("라벨이 있는 attr 번호만 ATTRnn 으로 더해지고, 화면에는 그 라벨을 보여준다", () => {
    const labels = ["국가", null, "", "   ", "속성5"];
    const options = buildDefTargetOptions(0, labels);
    expect(options.map((o) => o.value)).toEqual(["KEY", "ATTR01", "ATTR05"]);
    expect(options.find((o) => o.value === "ATTR01")?.label).toBe("국가");
    expect(options.find((o) => o.value === "ATTR05")?.label).toBe("속성5");
  });
});
