/**
 * 단위 계산기 유형 순수 로직 시험 — 설정 읽기·검증, 화면 값 계산, 기억 값 직렬화(스펙: 위젯 단위 계산기).
 * 렌더 시험은 unit-render.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  buildUnitConfig,
  computeView,
  initialState,
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
    for (const text of ["", "abc", "1.2.3", "Infinity"]) {
      const v = computeView(text, "length", "in", "mm");
      expect(v.ok).toBe(false);
      expect(v.resultText).toBe("숫자를 입력하세요");
      expect(v.plainText).toBe("");
      expect(v.rows.map((r) => r.text)).toEqual(Array(8).fill("–"));
      expect(v.belowAbsoluteZero).toBe(false);
    }
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
  it("인스턴스별 키 — 접두사 + instanceId", () => {
    expect(storageKey("def.abc12345", "inst-7")).toBe("dmes:widget:unit-converter:inst-7");
    expect(storageKey("def.abc12345", "inst-8")).not.toBe(storageKey("def.abc12345", "inst-7"));
  });

  it("인스턴스가 없거나 관리 화면 미리보기면 null(기억하지 않는다)", () => {
    expect(storageKey("def.abc12345", undefined)).toBeNull();
    expect(storageKey("def.abc12345", "")).toBeNull();
    expect(storageKey("def.abc12345", "preview")).toBeNull();
    expect(storageKey("def.preview", "inst-7")).toBeNull();
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

  it("기억한 분류가 설정에서 빠졌으면 기본 분류로 돌아간다(값·단위 기억은 남긴다)", () => {
    const stored: UnitState = { category: "pressure", units: { pressure: { from: "mpa", to: "psi" } }, text: "9" };
    const s = initialState(only, stored);
    expect(s.category).toBe("mass");
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
