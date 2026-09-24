import { describe, expect, it } from "vitest";
import {
  formatLabels,
  resolveLabels,
} from "../../../pages/dma/columnMng/labels";

/**
 * TSK-04-04 design.md §3.4 — 표시명 폴백(불변 규칙 I11, 수용 기준 2). 사전은 셋을 다 내려보내고 고르지 않으므로
 * 비어 있는 칸은 표시 쪽이 짧은 → 중간 → 긴 → 논리명 순으로 더 긴 쪽을 쓴다.
 */
describe("resolveLabels", () => {
  const base = { columnName: "원재료 코일 두께" };

  it("원값이 있으면 그대로 쓴다", () => {
    expect(
      resolveLabels({
        ...base,
        labelLong: "긴",
        labelMid: "중간",
        labelShort: "짧",
      }),
    ).toEqual({
      labelLong: "긴",
      labelMid: "중간",
      labelShort: "짧",
    });
  });

  it("짧은이 비면 중간을 쓴다", () => {
    expect(
      resolveLabels({
        ...base,
        labelLong: "긴",
        labelMid: "중간",
        labelShort: "",
      }).labelShort,
    ).toBe("중간");
  });

  it("중간도 비면 긴 쪽을 쓴다", () => {
    const r = resolveLabels({
      ...base,
      labelLong: "긴",
      labelMid: null,
      labelShort: undefined,
    });
    expect(r.labelMid).toBe("긴");
    expect(r.labelShort).toBe("긴");
  });

  it("셋 다 비면 논리명을 쓴다", () => {
    expect(resolveLabels({ ...base })).toEqual({
      labelLong: "원재료 코일 두께",
      labelMid: "원재료 코일 두께",
      labelShort: "원재료 코일 두께",
    });
  });

  it("공백만 있는 값은 빈 값으로 본다", () => {
    const r = resolveLabels({
      ...base,
      labelLong: "  ",
      labelMid: " \t",
      labelShort: " ",
    });
    expect(r.labelShort).toBe("원재료 코일 두께");
  });

  it("짧은이 비었을 때 긴 쪽을 건너뛰고 논리명으로 가지 않는다", () => {
    expect(
      resolveLabels({ columnName: "논리명", labelLong: "긴", labelShort: "" })
        .labelShort,
    ).toBe("긴");
  });

  it("formatLabels 는 폴백 결과를 ' / ' 로 잇는다", () => {
    expect(
      formatLabels({ columnName: "논리", labelLong: "긴", labelMid: "중간" }),
    ).toBe("긴 / 중간 / 중간");
  });
});
