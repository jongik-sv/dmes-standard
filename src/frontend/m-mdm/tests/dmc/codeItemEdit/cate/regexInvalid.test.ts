import { describe, expect, it } from "vitest";
import { isRegexInvalid } from "../../../../pages/dmc/codeItemEdit/cate/regexInvalid";

describe("isRegexInvalid", () => {
  it("REGEX 를 골랐고 서버가 문법 오류를 알렸을 때만 참이다", () => {
    expect(isRegexInvalid({ defKind: "REGEX" }, { invalidExpression: true })).toBe(true);
    expect(isRegexInvalid({ defKind: "REGEX" }, { invalidExpression: false })).toBe(false);
    expect(isRegexInvalid({ defKind: "REGEX" }, {})).toBe(false);
    expect(isRegexInvalid({ defKind: "REGEX" }, null)).toBe(false);
  });
  it("TABLE 이거나 고른 행이 없으면 거짓이다(남은 이전 결과를 무시한다)", () => {
    expect(isRegexInvalid({ defKind: "TABLE" }, { invalidExpression: true })).toBe(false);
    expect(isRegexInvalid(null, { invalidExpression: true })).toBe(false);
  });
});
