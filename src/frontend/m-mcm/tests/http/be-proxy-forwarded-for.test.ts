import { describe, expect, it } from "vitest";
import { forwardedForHeader } from "@/lib/http/forwarded-for";

describe("forwardedForHeader", () => {
  it("들어온 x-forwarded-for 를 그대로 돌려준다", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 10.1.2.3" });
    expect(forwardedForHeader(h)).toBe("1.1.1.1, 10.1.2.3");
  });

  it("없거나 빈 값이면 undefined", () => {
    expect(forwardedForHeader(new Headers())).toBeUndefined();
    expect(forwardedForHeader(new Headers({ "x-forwarded-for": "  " }))).toBeUndefined();
  });
});
