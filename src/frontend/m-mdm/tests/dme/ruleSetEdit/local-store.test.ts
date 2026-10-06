/** @vitest-environment happy-dom */
// 룰 세트 화면 개인 편의 저장소(3단계 계획 P10·Task 0) — 왕복, 깨진 값·다른 모양은 기본값, 저장소가 던져도 조용히 넘어가기, 최근 목록.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadFlag,
  loadInputs,
  loadRuleVersions,
  loadStrings,
  pushRecent,
  saveFlag,
  saveInputs,
  saveRuleVersions,
  saveStrings,
  storeKeys,
} from "../../../pages/dme/ruleSetEdit/debugger/local-store";
import { installDomStorage } from "../helpers/render";

beforeEach(() => {
  installDomStorage();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("local-store", () => {
  it("키 이름", () => {
    expect(storeKeys.breakpoints("S1")).toBe("rsf:bp:S1");
    expect(storeKeys.watches("S1")).toBe("rsf:watch:S1");
    expect(storeKeys.recentInputs("S1")).toBe("rsf:recent:S1");
    expect(storeKeys.recentExprs("S1")).toBe("rsf:expr:S1");
    expect(storeKeys.miniMap).toBe("rsf:minimap");
  });

  it("문자열 목록·입력 목록·플래그를 저장하고 그대로 읽는다", () => {
    saveStrings("k1", ["r1", "if1"]);
    expect(loadStrings("k1")).toEqual(["r1", "if1"]);
    saveInputs("k2", [{ recordJson: '{"A":"1"}', evalTs: "" }]);
    expect(loadInputs("k2")).toEqual([{ recordJson: '{"A":"1"}', evalTs: "", ruleVersions: "RELEASED" }]);
    saveFlag("k3", false);
    expect(loadFlag("k3", true)).toBe(false);
    expect(localStorage.getItem("k3")).toBe("false");
  });

  it("없거나 깨진 JSON·모양이 다른 값은 빈 목록·기본값", () => {
    expect(loadStrings("none")).toEqual([]);
    expect(loadInputs("none")).toEqual([]);
    expect(loadFlag("none", true)).toBe(true);
    localStorage.setItem("bad", "{not json");
    expect(loadStrings("bad")).toEqual([]);
    expect(loadInputs("bad")).toEqual([]);
    expect(loadFlag("bad", false)).toBe(false);
    localStorage.setItem("obj", '{"a":1}');
    expect(loadStrings("obj")).toEqual([]);
    expect(loadInputs("obj")).toEqual([]);
    expect(loadFlag("obj", true)).toBe(true);
    localStorage.setItem("mixed", '["r1", 2, null, "r2"]');
    expect(loadStrings("mixed")).toEqual(["r1", "r2"]);
    localStorage.setItem("inputs", '[{"recordJson":"{}","evalTs":""},{"recordJson":1},null,{"recordJson":"{}","evalTs":"x","extra":true}]');
    expect(loadInputs("inputs")).toEqual([
      { recordJson: "{}", evalTs: "", ruleVersions: "RELEASED" },
      { recordJson: "{}", evalTs: "x", ruleVersions: "RELEASED" },
    ]);
  });

  it("setItem 이 던져도(용량 초과) 조용히 넘어간다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveStrings("k", ["a"])).not.toThrow();
    expect(() => saveInputs("k", [])).not.toThrow();
    expect(() => saveFlag("k", true)).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("getItem 이 던져도 기본값", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadStrings("k")).toEqual([]);
    expect(loadInputs("k")).toEqual([]);
    expect(loadFlag("k", true)).toBe(true);
  });

  it("pushRecent 는 같은 항목을 맨 앞으로 옮기고 max 로 자른다", () => {
    const same = (a: string, b: string) => a === b;
    expect(pushRecent(["a", "b", "c"], "b", same, 10)).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", same, 3)).toEqual(["d", "a", "b"]);
    const list = ["x"];
    pushRecent(list, "y", same, 5);
    expect(list).toEqual(["x"]); // 입력을 바꾸지 않는다
  });
});

describe("룰 버전 모드 기억(spec 2026-10-06 §7.2)", () => {
  it("저장한 값을 읽고 잘못된 값은 RELEASED", () => {
    expect(loadRuleVersions()).toBe("RELEASED");
    saveRuleVersions("MY_DRAFT");
    expect(loadRuleVersions()).toBe("MY_DRAFT");
    localStorage.setItem(storeKeys.ruleVersions, JSON.stringify("DRAFT"));
    expect(loadRuleVersions()).toBe("RELEASED");
  });
  it("최근 입력에 모드를 저장하고 옛 항목(모드 없음)은 RELEASED 로 읽는다", () => {
    saveInputs("k", [{ recordJson: "{}", evalTs: "", ruleVersions: "MY_DRAFT" }]);
    expect(loadInputs("k")).toEqual([{ recordJson: "{}", evalTs: "", ruleVersions: "MY_DRAFT" }]);
    localStorage.setItem("k2", JSON.stringify([{ recordJson: "{}", evalTs: "" }]));
    expect(loadInputs("k2")).toEqual([{ recordJson: "{}", evalTs: "", ruleVersions: "RELEASED" }]);
  });
});
