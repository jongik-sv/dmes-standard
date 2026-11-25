// 압연두께Set 표시 — 보정치 부호, Set 두께 = 주문두께 + 보정치(적중 없음은 보정 0).
import { describe, expect, it } from "vitest";

import { formatResult, type JudgeResult } from "@/common/rule";
import { DISPLAY, setThicknessTile } from "@/qdm/rollingThicknessSet/display";

const judged = (status: JudgeResult["status"], adj?: string): JudgeResult => ({
  ruleId: "C10B2060",
  ver: "1.000",
  evalTs: "",
  status,
  hits: [],
  results: adj === undefined ? {} : { THK_ADJ: adj, THK_COR_UNT: "CRN" },
  defaultApplied: false,
  trace: [],
  message: null,
});

describe("압연두께Set 표시", () => {
  it("보정치는 부호를 붙인다", () => {
    expect(formatResult(DISPLAY, "THK_ADJ", "-0.04")).toBe("−0.04");
    expect(formatResult(DISPLAY, "THK_ADJ", "0.1")).toBe("+0.1");
    expect(formatResult(DISPLAY, "THK_COR_UNT", "-")).toBe("—");
  });

  it("Set 두께 — 0.45 − 0.04 = 0.41, 적중 없음은 주문두께 그대로, 두께가 없으면 안내", () => {
    const args = (result: JudgeResult, thk?: string) => ({
      ruleId: "C10B2060",
      rule: undefined,
      result,
      input: thk === undefined ? {} : { THK: thk },
    });
    expect(setThicknessTile(args(judged("MATCHED", "-0.04"), "0.45"))).toEqual([
      expect.objectContaining({
        value: "0.41",
        unit: "mm",
        target: "주문두께 0.45 − 0.04",
      }),
    ]);
    expect(
      setThicknessTile(args(judged("MATCHED", "0.02"), "0.45"))[0].target,
    ).toBe("주문두께 0.45 + 0.02");
    const miss = setThicknessTile(args(judged("NO_MATCH"), "0.45"))[0];
    expect(miss.value).toBe("0.45");
    expect(miss.target).toContain("보정 0");
    expect(setThicknessTile(args(judged("MATCHED", "-0.04")))[0].value).toBe(
      "—",
    );
  });
});
