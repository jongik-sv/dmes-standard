// 토큰 칩 입력(shared token-chip-input) 순수 함수 — 쪼개기·잇기·규칙 거르기·더하기.
import { describe, expect, it } from "vitest";

import { addTokens, filterTokens, joinTokens, parseTokens } from "../../src/components/token-chip-input";

describe("parseTokens · joinTokens", () => {
  it("쉼표·공백으로 쪼개 앞뒤를 다듬고 빈 것을 버리며 순서를 지키고 중복은 처음 것만 남긴다", () => {
    expect(parseTokens(" alpha, beta  gamma,,beta\ndelta ")).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(parseTokens("")).toEqual([]);
    expect(parseTokens(null)).toEqual([]);
    expect(joinTokens(["alpha", "beta"])).toBe("alpha,beta");
    expect(joinTokens(undefined)).toBe("");
  });
});

describe("filterTokens · addTokens", () => {
  it("기본 모양·허용 목록·중복·글자 수 한도로 거르고 이유를 돌려준다", () => {
    const r = filterTokens(["alpha", "9x", "zzz", "beta", "alpha"], { allowed: ["alpha", "beta", "9x"], existing: ["beta"] });
    expect(r.accepted).toEqual(["alpha"]);
    expect(r.rejected).toEqual([
      { token: "9x", reason: "pattern" },
      { token: "zzz", reason: "outside" },
      { token: "beta", reason: "duplicate" },
      { token: "alpha", reason: "duplicate" },
    ]);
    expect(filterTokens(["abc", "de"], { maxLength: 5 })).toEqual({ accepted: ["abc"], rejected: [{ token: "de", reason: "maxLength" }] });
    expect(filterTokens(["9x"], { pattern: null }).accepted).toEqual(["9x"]);
  });

  it("g 깃발 정규식도 매번 같은 결과를 낸다", () => {
    const r = filterTokens(["aa", "bb", "cc"], { pattern: /^[a-z]+$/g });
    expect(r.accepted).toEqual(["aa", "bb", "cc"]);
  });

  it("addTokens 는 글을 쪼개 받아들인 것만 뒤에 붙인다", () => {
    const value = ["alpha"];
    const r = addTokens(value, "beta, 1bad gamma", {});
    expect(r.next).toEqual(["alpha", "beta", "gamma"]);
    expect(r.rejected).toEqual([{ token: "1bad", reason: "pattern" }]);
    expect(value).toEqual(["alpha"]);
  });
});
