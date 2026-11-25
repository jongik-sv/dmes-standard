// 출력물 화면의 순수 도우미 — 판정값 JSON, 상태 톤.
import { describe, expect, it } from "vitest";

import { buildValuesJson } from "@/qjd/qualityJudgment/api";
import { toneOf } from "@/qpr/shared/status";

describe("판정 계산 입력", () => {
  it("고친 값만 JSON 으로, 없으면 빈 문자열", () => {
    expect(buildValuesJson({})).toBe("");
    expect(JSON.parse(buildValuesJson({ YP: " 268 ", THK: "" }))).toEqual({ YP: "268", THK: "" });
  });
});

describe("상태 톤", () => {
  it("합격·발행은 success, 불합격·회수는 danger, 보류·초안은 warning, 모르는 값은 neutral", () => {
    expect(toneOf("PASS")).toBe("success");
    expect(toneOf("ISSUED")).toBe("success");
    expect(toneOf("FAIL")).toBe("danger");
    expect(toneOf("RECALLED")).toBe("danger");
    expect(toneOf("HOLD")).toBe("warning");
    expect(toneOf("DRAFT")).toBe("warning");
    expect(toneOf("??")).toBe("neutral");
  });
});
