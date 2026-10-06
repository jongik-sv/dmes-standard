// 테스트 케이스 표 높이: 20행까지는 행 수만큼, 넘으면 20행(헤더 포함) 높이로 고정하고 표 안에서 스크롤한다.
import { describe, expect, it } from "vitest";

import { TC_GRID_MAX_ROWS, tcGridHeight } from "../../../pages/dme/ruleEdit/cards/TestCaseCard";

describe("tcGridHeight", () => {
  it("최대 행 수 이하이면 행 수만큼 늘어난다", () => {
    expect(tcGridHeight(0)).toBe("auto");
    expect(tcGridHeight(TC_GRID_MAX_ROWS)).toBe("auto");
  });
  it("최대 행 수를 넘으면 고정 높이(헤더 1줄 + 20행)로 바뀐다", () => {
    expect(tcGridHeight(TC_GRID_MAX_ROWS + 1)).toBe(28 * 21 + 2);
    expect(tcGridHeight(500)).toBe(28 * 21 + 2);
  });
});
