// 켜고 끄는 칩 묶음(shared toggle-chip-group) 순수 함수 — 켜고 끄기(옵션 순서 유지)와 기준 비교 상태.
import { describe, expect, it } from "vitest";

import { applyPreset, chipDiffState, orderValues, toggleValue } from "../../src/components/toggle-chip-group";

const ORDER = ["alpha", "beta", "gamma", "delta"];

describe("toggleValue · orderValues", () => {
  it("켜고 끈 결과는 옵션 순서이고, 옵션 밖 값은 뒤에 남으며 입력은 바뀌지 않는다", () => {
    const v = ["gamma", "alpha"];
    expect(toggleValue(v, "beta", ORDER)).toEqual(["alpha", "beta", "gamma"]);
    expect(toggleValue(v, "alpha", ORDER)).toEqual(["gamma"]);
    expect(toggleValue(["zzz", "alpha"], "delta", ORDER)).toEqual(["alpha", "delta", "zzz"]);
    expect(orderValues(["delta", "delta", "alpha"], ORDER)).toEqual(["alpha", "delta"]);
    expect(v).toEqual(["gamma", "alpha"]);
  });
});

describe("chipDiffState", () => {
  it("기준이 없으면 on/off, 있으면 켜졌는데 기준에 없으면 added·꺼졌는데 기준에 있으면 removed", () => {
    expect(chipDiffState("alpha", ["alpha"])).toBe("on");
    expect(chipDiffState("beta", ["alpha"])).toBe("off");
    const base = ["alpha", "beta"];
    const now = ["alpha", "gamma"];
    expect(chipDiffState("alpha", now, base)).toBe("on");
    expect(chipDiffState("gamma", now, base)).toBe("added");
    expect(chipDiffState("beta", now, base)).toBe("removed");
    expect(chipDiffState("delta", now, base)).toBe("off");
  });
});

describe("applyPreset", () => {
  it("일괄 선택은 옵션 순서로 맞추고 disabled 옵션은 현재 상태를 지킨다", () => {
    const options = ORDER.map((value) => ({ value, disabled: value === "delta" }));
    expect(applyPreset(ORDER, ["beta"], options)).toEqual(["alpha", "beta", "gamma"]);
    expect(applyPreset(["gamma"], ["delta", "beta"], options)).toEqual(["gamma", "delta"]);
    expect(applyPreset([], [], options)).toEqual([]);
  });
});
