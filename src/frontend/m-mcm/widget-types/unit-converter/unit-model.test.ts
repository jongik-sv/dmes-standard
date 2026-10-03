/**
 * 단위 계산기 유형 순수 로직 시험 — 설정 읽기·검증, 화면 값 계산, 기억 값 직렬화(스펙: 위젯 단위 계산기).
 * 렌더 시험은 unit-render.test.ts.
 */
import { D } from "@dk-oasis/shared/evalex";
import { describe, expect, it } from "vitest";

import {
  buildUnitConfig,
  changeUnitSelection,
  computeView,
  findNonFinite,
  initialState,
  isRememberable,
  normalizeSelection,
  parseStoredState,
  pickDefaultCategory,
  readUnitConfig,
  readUnitSelection,
  resolveCategory,
  resolveUnits,
  serializeState,
  storageKey,
  UNIT_ABSOLUTE_ZERO_WARNING,
  UNIT_CATEGORIES_TYPE_ERROR,
  UNIT_DEFAULT_CONFIG,
  UNIT_DEFAULT_OUTSIDE_ERROR,
  UNIT_DEFAULT_TEXT,
  UNIT_DEFAULT_TYPE_ERROR,
  unitUnknownCategoryError,
  validateUnitConfig,
  type UnitState,
} from "./unit-model";
import { meta } from "./type.meta";
import { CATEGORY_IDS } from "./units";

describe("유형 메타", () => {
  it("id·이름·설명·크기가 지시와 같다", () => {
    expect(meta.id).toBe("unit-converter");
    expect(meta.title).toBe("단위 계산기");
    expect(meta.description).toBe("길이·무게·압력·온도 등 단위 환산");
    expect(meta.defaultSize).toEqual({ w: 8, h: 12 });
    expect(meta.minSize).toEqual({ w: 5, h: 8 });
  });

  it("초기 설정은 { categories: [], defaultCategory: length } 이고 검사를 통과하며 읽으면 전체·length 다", () => {
    expect(meta.initialConfig).toEqual({ categories: [], defaultCategory: "length" });
    expect(meta.initialConfig).toEqual(UNIT_DEFAULT_CONFIG);
    expect(validateUnitConfig(meta.initialConfig)).toEqual([]);
    expect(readUnitConfig(meta.initialConfig)).toEqual({ categories: [...CATEGORY_IDS], defaultCategory: "length" });
  });
});

describe("readUnitConfig — 잘못된 값은 기본값으로 읽는다", () => {
  const ALL = [...CATEGORY_IDS];

  it("빈 categories·없음·목록 아님은 전체 분류", () => {
    expect(readUnitConfig({ categories: [], defaultCategory: "length" }).categories).toEqual(ALL);
    expect(readUnitConfig({ defaultCategory: "length" }).categories).toEqual(ALL);
    expect(readUnitConfig({ categories: "length" }).categories).toEqual(ALL);
    expect(readUnitConfig({ categories: null }).categories).toEqual(ALL);
  });

  it("설정 자체가 없거나 객체가 아니어도 읽힌다", () => {
    for (const raw of [undefined, null, 5, "x", [], [1]]) {
      expect(readUnitConfig(raw)).toEqual({ categories: ALL, defaultCategory: "length" });
    }
  });

  it("고른 분류는 표 순서로, 중복·모르는 id 는 뺀다", () => {
    expect(readUnitConfig({ categories: ["pressure", "length", "length", "zzz", 3, null], defaultCategory: "length" }).categories).toEqual([
      "length",
      "pressure",
    ]);
  });

  it("알려진 id 가 하나도 없으면 전체", () => {
    expect(readUnitConfig({ categories: ["zzz"] }).categories).toEqual(ALL);
  });

  it("기본 분류가 틀리거나 보일 분류 밖이면 length(보일 분류에 없으면 첫 분류)", () => {
    expect(readUnitConfig({ categories: [], defaultCategory: "zzz" }).defaultCategory).toBe("length");
    expect(readUnitConfig({ categories: [], defaultCategory: 5 }).defaultCategory).toBe("length");
    expect(readUnitConfig({ categories: ["mass", "pressure"], defaultCategory: "length" }).defaultCategory).toBe("mass");
    expect(readUnitConfig({ categories: ["mass", "length"], defaultCategory: "force" }).defaultCategory).toBe("length");
    expect(readUnitConfig({ categories: ["mass", "pressure"], defaultCategory: "pressure" }).defaultCategory).toBe("pressure");
  });

  it("readUnitSelection·pickDefaultCategory", () => {
    expect(readUnitSelection({ categories: ["energy", "mass"] })).toEqual(["mass", "energy"]);
    expect(readUnitSelection(undefined)).toEqual([]);
    expect(pickDefaultCategory(["speed", "energy"], "energy")).toBe("energy");
    expect(pickDefaultCategory(["speed", "energy"], "length")).toBe("speed");
    expect(pickDefaultCategory(ALL, "force")).toBe("force");
  });
});

describe("validateUnitConfig", () => {
  it("정상 설정은 오류 없음 — 빈 categories(=전체)·빠진 값 포함", () => {
    expect(validateUnitConfig({ categories: [], defaultCategory: "length" })).toEqual([]);
    expect(validateUnitConfig({ categories: ["length", "mass"], defaultCategory: "mass" })).toEqual([]);
    expect(validateUnitConfig({})).toEqual([]);
    expect(validateUnitConfig(undefined)).toEqual([]);
    expect(validateUnitConfig({ categories: ["length"] })).toEqual([]);
    expect(validateUnitConfig({ categories: [], defaultCategory: "energy" })).toEqual([]); // 전체 안
  });

  it("모르는 분류 id 는 오류(같은 id 는 한 번만)", () => {
    expect(validateUnitConfig({ categories: ["length", "zzz", "zzz", "qqq"], defaultCategory: "length" })).toEqual([
      unitUnknownCategoryError("zzz"),
      unitUnknownCategoryError("qqq"),
    ]);
    expect(validateUnitConfig({ categories: [5], defaultCategory: "length" })).toEqual([unitUnknownCategoryError(5)]);
  });

  it("모르는 기본 분류는 오류", () => {
    expect(validateUnitConfig({ categories: [], defaultCategory: "zzz" })).toEqual([unitUnknownCategoryError("zzz")]);
  });

  it("기본 분류가 보일 분류 밖이면 오류", () => {
    expect(validateUnitConfig({ categories: ["length", "mass"], defaultCategory: "pressure" })).toEqual([UNIT_DEFAULT_OUTSIDE_ERROR]);
  });

  it("모르는 id 와 기본 분류가 함께 틀리면 둘 다 알린다(알려진 분류 기준으로 범위를 본다)", () => {
    expect(validateUnitConfig({ categories: ["mass", "zzz"], defaultCategory: "length" })).toEqual([
      unitUnknownCategoryError("zzz"),
      UNIT_DEFAULT_OUTSIDE_ERROR,
    ]);
  });

  it("형이 틀리면 오류", () => {
    expect(validateUnitConfig({ categories: "length", defaultCategory: "length" })).toEqual([UNIT_CATEGORIES_TYPE_ERROR]);
    expect(validateUnitConfig({ categories: [], defaultCategory: 5 })).toEqual([UNIT_DEFAULT_TYPE_ERROR]);
  });

  it("buildUnitConfig — 알려진 분류만 표 순서로, 기본 분류는 보일 분류 안으로 맞춘다", () => {
    expect(buildUnitConfig(["pressure", "length"], "pressure")).toEqual({ categories: ["length", "pressure"], defaultCategory: "pressure" });
    expect(buildUnitConfig(["mass"], "length")).toEqual({ categories: ["mass"], defaultCategory: "mass" });
    expect(buildUnitConfig([], "force")).toEqual({ categories: [], defaultCategory: "force" });
    expect(validateUnitConfig(buildUnitConfig(["mass", "energy"], "pressure"))).toEqual([]);
  });

  it("모든 분류를 골랐으면 [] 로 저장한다(분류가 늘어도 보이게) — 기본 분류는 그대로", () => {
    expect(normalizeSelection(CATEGORY_IDS)).toEqual([]);
    expect(normalizeSelection([...CATEGORY_IDS].reverse())).toEqual([]);
    expect(normalizeSelection([])).toEqual([]);
    expect(normalizeSelection(["pressure", "length"])).toEqual(["length", "pressure"]);
    expect(normalizeSelection(CATEGORY_IDS.filter((id) => id !== "speed"))).toHaveLength(CATEGORY_IDS.length - 1);
    expect(buildUnitConfig(CATEGORY_IDS, "force")).toEqual({ categories: [], defaultCategory: "force" });
  });

  it("changeUnitSelection — 체크박스는 보일 분류만 바꾸고 기본 분류는 받은 값 그대로 둔다", () => {
    expect(changeUnitSelection({ categories: ["length", "mass"], defaultCategory: "mass" }, ["length", "mass", "area"])).toEqual({
      categories: ["length", "mass", "area"],
      defaultCategory: "mass",
    });
    // 기본 분류가 보일 분류 밖이 돼도 조용히 고치지 않는다 — 검사 오류가 알린다
    const outside = changeUnitSelection({ categories: ["length", "mass"], defaultCategory: "mass" }, ["length"]);
    expect(outside).toEqual({ categories: ["length"], defaultCategory: "mass" });
    expect(validateUnitConfig(outside)).toEqual([UNIT_DEFAULT_OUTSIDE_ERROR]);
    // 이미 틀린 기본 분류도 그대로(알 수 없는 id·형이 틀린 값 포함)
    expect(changeUnitSelection({ categories: ["length"], defaultCategory: "pressure" }, ["length", "mass"]).defaultCategory).toBe("pressure");
    expect(changeUnitSelection({ categories: [], defaultCategory: "zzz" }, ["length"]).defaultCategory).toBe("zzz");
    expect(changeUnitSelection({ categories: [], defaultCategory: 5 }, ["length"]).defaultCategory).toBe(5);
    // 바로 그 체크가 틀린 기본 분류를 바로잡는 경우는 그대로 맞는다
    expect(validateUnitConfig(changeUnitSelection({ categories: ["length"], defaultCategory: "pressure" }, ["length", "pressure"]))).toEqual([]);
    // 모두 켜면 []
    expect(changeUnitSelection({ categories: ["length"], defaultCategory: "length" }, CATEGORY_IDS)).toEqual({ categories: [], defaultCategory: "length" });
  });

  it("changeUnitSelection — 기본 분류가 빠져 있으면 새 보일 분류 기준 읽은 값으로 채운다", () => {
    expect(changeUnitSelection({ categories: [] }, ["mass", "area"])).toEqual({ categories: ["mass", "area"], defaultCategory: "mass" });
    expect(changeUnitSelection({ categories: [] }, ["length", "mass"]).defaultCategory).toBe("length");
    expect(changeUnitSelection(undefined, ["pressure"])).toEqual({ categories: ["pressure"], defaultCategory: "pressure" });
    expect(changeUnitSelection({ defaultCategory: "" }, ["force"]).defaultCategory).toBe("force");
  });
});

describe("computeView", () => {
  it("숫자 입력이면 결과·쉼표 없는 결과·모든 단위 목록을 돌려준다", () => {
    const v = computeView("1", "length", "in", "mm");
    expect(v.ok).toBe(true);
    expect(v.resultText).toBe("25.4");
    expect(v.plainText).toBe("25.4");
    expect(v.rows.map((r) => r.id)).toEqual(["mm", "cm", "m", "km", "in", "ft", "yd", "mi"]);
    expect(v.rows.find((r) => r.id === "mm")?.text).toBe("25.4");
    expect(v.rows.find((r) => r.id === "in")?.text).toBe("1");
    expect(v.rows.find((r) => r.id === "ft")?.text).toBe("0.08333333333");
    expect(v.belowAbsoluteZero).toBe(false);
  });

  it("쉼표를 넣어 보이고, plainText 는 쉼표가 없다", () => {
    const v = computeView("1", "length", "km", "mm");
    expect(v.resultText).toBe("1,000,000");
    expect(v.plainText).toBe("1000000");
  });

  it("입력의 쉼표·공백은 무시한다", () => {
    expect(computeView(" 1,000 ", "length", "mm", "m").resultText).toBe("1");
  });

  it("숫자가 아니면 안내 문구와 빈 값 줄(–)", () => {
    for (const text of ["", "abc", "1.2.3", "Infinity", "1,5", "1,2,3"]) {
      const v = computeView(text, "length", "in", "mm");
      expect(v.ok, text).toBe(false);
      expect(v.problem, text).toBe(text === "" ? "empty" : "invalid");
      expect(v.resultText, text).toBe("숫자를 입력하세요");
      expect(v.plainText).toBe("");
      expect(v.exactText).toBe("");
      expect(v.rows.map((r) => r.text)).toEqual(Array(8).fill("–"));
      expect(v.belowAbsoluteZero).toBe(false);
    }
  });

  it("입력 지수가 너무 크거나 작으면 「값이 너무 큽니다」·「값이 너무 작습니다」 — 무한대를 보이지 않고 복사·[⇄] 값도 없다", () => {
    for (const [text, problem, message] of [
      ["1e9000000000000000", "tooLarge", "값이 너무 큽니다"],
      ["1e1001", "tooLarge", "값이 너무 큽니다"],
      ["-3e5000", "tooLarge", "값이 너무 큽니다"],
      ["1e-1001", "tooSmall", "값이 너무 작습니다"],
      ["1e-9000000000000000", "tooSmall", "값이 너무 작습니다"],
    ] as const) {
      const v = computeView(text, "length", "km", "mm");
      expect(v.ok, text).toBe(false);
      expect(v.problem, text).toBe(problem);
      expect(v.resultText, text).toBe(message);
      expect(v.plainText).toBe("");
      expect(v.exactText).toBe("");
      expect(v.rows.every((r) => r.text === "–")).toBe(true);
    }
    // 상한 안(지수 1000)은 계산한다 — 결과가 지수 1006 이어도 유한하다
    const edge = computeView("1e1000", "length", "km", "mm");
    expect(edge.ok).toBe(true);
    expect(edge.resultText).toBe("1e+1006");
    expect(edge.exactText).toBe(""); // 입력으로 읽을 수 없는 크기라 [⇄] 는 값을 잇지 않는다
    expect(computeView("1e-1000", "length", "mm", "km").resultText).toBe("1e-1006");
  });

  it("findNonFinite — 무한대는 tooLarge, NaN 은 invalid, 모두 유한하면 null(방어선)", () => {
    expect(findNonFinite([new D(1), new D("1e1000")])).toBeNull();
    expect(findNonFinite([])).toBeNull();
    expect(findNonFinite([new D(1), new D("Infinity")])).toBe("tooLarge");
    expect(findNonFinite([new D("-Infinity")])).toBe("tooLarge");
    expect(findNonFinite([new D("Infinity"), new D("NaN")])).toBe("invalid");
    expect(findNonFinite([new D("NaN")])).toBe("invalid");
  });

  it("exactText — [⇄] 가 잇는 17자리 정밀 값(화면 결과는 10자리)", () => {
    const v = computeView("9.999999999", "pressure", "mpa", "kgfcm2");
    expect(v.resultText).toBe("101.9716213");
    expect(v.exactText).toBe("101.97162128759566");
    expect(v.plainText).toBe("101.9716213");
    // 되돌려 환산하면 원래 값
    const back = computeView(v.exactText, "pressure", "kgfcm2", "mpa");
    expect(back.resultText).toBe("9.999999999");
    expect(back.exactText).toBe("9.9999999989999998"); // 17자리 반올림 오차는 표시 10자리 밖이다
    expect(computeView("1", "length", "km", "mm").exactText).toBe("1000000");
    expect(computeView("1e10", "length", "km", "mm").exactText).toBe("1e+16");
    expect(computeView("0", "length", "km", "mm").exactText).toBe("0");
  });

  it("쉼표는 천 단위 모양만, 전각 숫자는 반각으로 읽는다", () => {
    expect(computeView("1,234", "length", "mm", "mm").resultText).toBe("1,234");
    expect(computeView("１２", "length", "mm", "mm").resultText).toBe("12");
  });

  it("음수는 모든 분류에서 계산한다", () => {
    expect(computeView("-1", "length", "in", "mm").resultText).toBe("-25.4");
    expect(computeView("-1", "pressure", "mpa", "kgfcm2").resultText).toBe("-10.19716213");
    expect(computeView("-1", "temperature", "celsius", "fahrenheit").resultText).toBe("30.2");
  });

  it("-40 °C = -40 °F", () => {
    expect(computeView("-40", "temperature", "celsius", "fahrenheit").resultText).toBe("-40");
  });

  it("절대영도 아래 온도는 계산은 하고 경고를 켠다", () => {
    const v = computeView("-300", "temperature", "celsius", "kelvin");
    expect(v.ok).toBe(true);
    expect(v.resultText).toBe("-26.85");
    expect(v.belowAbsoluteZero).toBe(true);
    expect(computeView("-273.15", "temperature", "celsius", "kelvin").belowAbsoluteZero).toBe(false);
    expect(computeView("-300", "length", "m", "mm").belowAbsoluteZero).toBe(false);
    expect(UNIT_ABSOLUTE_ZERO_WARNING).toContain("절대영도");
  });

  it("모르는 변환 후 단위면 첫 단위 값을 결과로 쓴다", () => {
    expect(computeView("1", "length", "m", "zz").resultText).toBe("1,000");
  });
});

describe("기억 키", () => {
  it("사용자·인스턴스별 키 — dmes:widget:unit-converter:{userId}:{instanceId}", () => {
    expect(storageKey("def.abc12345", "inst-7", "u1")).toBe("dmes:widget:unit-converter:u1:inst-7");
    expect(storageKey("def.abc12345", "inst-8", "u1")).not.toBe(storageKey("def.abc12345", "inst-7", "u1"));
    // 같은 instanceId(관리자가 정한 기본 배치)라도 사용자가 다르면 키가 다르다
    expect(storageKey("def.abc12345", "inst-7", "u2")).toBe("dmes:widget:unit-converter:u2:inst-7");
    expect(storageKey("def.abc12345", "inst-7", "u2")).not.toBe(storageKey("def.abc12345", "inst-7", "u1"));
  });

  it("사용자를 모르면 null(기억하지 않는다)", () => {
    expect(storageKey("def.abc12345", "inst-7", "")).toBeNull();
    expect(storageKey("def.abc12345", "inst-7", null)).toBeNull();
    expect(storageKey("def.abc12345", "inst-7", undefined)).toBeNull();
  });

  it("인스턴스가 없거나 관리 화면 미리보기면 null(기억하지 않는다)", () => {
    expect(storageKey("def.abc12345", undefined, "u1")).toBeNull();
    expect(storageKey("def.abc12345", "", "u1")).toBeNull();
    expect(storageKey("def.abc12345", "preview", "u1")).toBeNull();
    expect(storageKey("def.preview", "inst-7", "u1")).toBeNull();
  });

  it("isRememberable — 인스턴스가 있고 미리보기가 아니다", () => {
    expect(isRememberable("def.abc12345", "inst-7")).toBe(true);
    expect(isRememberable("def.abc12345", undefined)).toBe(false);
    expect(isRememberable("def.abc12345", "")).toBe(false);
    expect(isRememberable("def.abc12345", "preview")).toBe(false);
    expect(isRememberable("def.preview", "inst-7")).toBe(false);
  });
});

describe("기억한 상태 직렬화·검증", () => {
  const state: UnitState = {
    category: "pressure",
    units: { pressure: { from: "mpa", to: "psi" }, length: { from: "ft", to: "m" } },
    text: "12.5",
  };

  it("직렬화한 글을 다시 읽으면 같다", () => {
    expect(parseStoredState(serializeState(state))).toEqual(state);
  });

  it("없거나 깨진 글은 null", () => {
    expect(parseStoredState(null)).toBeNull();
    expect(parseStoredState(undefined)).toBeNull();
    expect(parseStoredState("")).toBeNull();
    expect(parseStoredState("{깨짐")).toBeNull();
    expect(parseStoredState("[]")).toBeNull();
    expect(parseStoredState('"x"')).toBeNull();
  });

  it("모르는 분류는 null", () => {
    expect(parseStoredState(JSON.stringify({ v: 1, category: "zzz", units: {}, text: "1" }))).toBeNull();
    expect(parseStoredState(JSON.stringify({ v: 1, units: {}, text: "1" }))).toBeNull();
  });

  it("모르는 단위는 그 분류의 기본 단위로, 모르는 분류의 단위 쌍은 버린다", () => {
    const parsed = parseStoredState(
      JSON.stringify({ v: 1, category: "length", units: { length: { from: "ft", to: "zz" }, zzz: { from: "a", to: "b" }, mass: "x" }, text: "3" })
    );
    expect(parsed).toEqual({ category: "length", units: { length: { from: "ft", to: "in" } }, text: "3" });
  });

  it("입력값이 글이 아니면 기본 「1」, 글이면 비어 있어도 그대로, 너무 길면 자른다", () => {
    expect(parseStoredState(JSON.stringify({ category: "mass", text: 5 }))?.text).toBe(UNIT_DEFAULT_TEXT);
    expect(parseStoredState(JSON.stringify({ category: "mass", text: "" }))?.text).toBe("");
    expect(parseStoredState(JSON.stringify({ category: "mass", text: "1".repeat(80) }))?.text).toBe("1".repeat(50));
  });
});

describe("초기 상태·분류·단위 맞추기", () => {
  const all = readUnitConfig({});
  const only = readUnitConfig({ categories: ["length", "mass"], defaultCategory: "mass" });

  it("기억이 없으면 기본 분류·「1」", () => {
    expect(initialState(all, null)).toEqual({ category: "length", units: {}, text: "1" });
    expect(initialState(only, null)).toEqual({ category: "mass", units: {}, text: "1" });
  });

  it("기억한 분류가 보일 분류 안이면 그대로", () => {
    const stored: UnitState = { category: "length", units: { length: { from: "ft", to: "m" } }, text: "9" };
    expect(initialState(only, stored)).toEqual(stored);
  });

  it("기억한 분류가 설정에서 빠졌어도 상태에는 그대로 두고(덮지 않는다) 화면만 기본 분류를 보인다(값·단위 기억도 남긴다)", () => {
    const stored: UnitState = { category: "pressure", units: { pressure: { from: "mpa", to: "psi" } }, text: "9" };
    const s = initialState(only, stored);
    expect(s).toEqual(stored);
    expect(resolveCategory(s.category, only)).toBe("mass");
    expect(s.text).toBe("9");
  });

  it("resolveCategory — 모르는 값·보일 분류 밖은 기본 분류", () => {
    expect(resolveCategory("length", only)).toBe("length");
    expect(resolveCategory("energy", only)).toBe("mass");
    expect(resolveCategory(undefined, only)).toBe("mass");
    expect(resolveCategory("zzz", all)).toBe("length");
  });

  it("resolveUnits — 고른 값이 그 분류의 단위가 아니면 기본 단위", () => {
    expect(resolveUnits("length", { from: "ft", to: "m" })).toEqual({ from: "ft", to: "m" });
    expect(resolveUnits("length", { from: "kg", to: "zz" })).toEqual({ from: "mm", to: "in" });
    expect(resolveUnits("pressure", undefined)).toEqual({ from: "mpa", to: "kgfcm2" });
  });
});
