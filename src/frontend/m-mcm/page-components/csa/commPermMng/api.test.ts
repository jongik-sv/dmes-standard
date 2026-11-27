import { describe, expect, it } from "vitest";

import { rejectMessage } from "./api";

describe("rejectMessage — 거절 문구에 코드 붙이기", () => {
  it("문구가 이미 코드로 시작하면 그대로 둔다", () => {
    expect(rejectMessage({ meta: { success: false, message: "PERM_EMPTY_BTN: r × o", code: "PERM_EMPTY_BTN" } })).toBe(
      "PERM_EMPTY_BTN: r × o",
    );
  });

  it("코드가 따로 칸에만 있으면 문구 앞에 붙인다", () => {
    expect(rejectMessage({ meta: { success: false, message: "밖 값 print" }, errors: [{ code: "PERM_NOT_IN_OBJ" }] })).toBe(
      "PERM_NOT_IN_OBJ: 밖 값 print",
    );
  });
});
