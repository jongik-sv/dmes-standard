/**
 * 단위 계산기 환산 시험 — 계수·온도(비선형)·왕복 변환. @dk-oasis/shared/evalex 의 D 로 계산한다(shared dist 필요).
 */
import { D } from "@dk-oasis/shared/evalex";
import { describe, expect, it } from "vitest";

import { formatNumber } from "./unit-format";
import {
  CATEGORIES,
  CATEGORY_IDS,
  convert,
  convertAll,
  findUnit,
  getCategory,
  isBelowAbsoluteZero,
  isCategoryId,
  type CategoryId,
} from "./units";

/** value(문자열) → 10자리 반올림 표기(쉼표 없음) */
const conv = (value: string, category: CategoryId, from: string, to: string) =>
  formatNumber(convert(new D(value), category, from, to), false);

describe("분류·단위 표", () => {
  it("분류 id 는 9개이고 순서가 스펙 표와 같다", () => {
    expect(CATEGORY_IDS).toEqual(["length", "mass", "area", "volume", "temperature", "pressure", "force", "speed", "energy"]);
    expect(CATEGORIES.map((c) => c.label)).toEqual(["길이", "무게", "면적", "부피", "온도", "압력", "힘", "속도", "에너지"]);
  });

  it("분류별 단위 id 목록", () => {
    expect(Object.fromEntries(CATEGORIES.map((c) => [c.id, c.units.map((u) => u.id)]))).toEqual({
      length: ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"],
      mass: ["mg", "g", "kg", "t", "lb", "oz"],
      area: ["mm2", "cm2", "m2", "km2", "ha", "pyeong", "ft2", "in2"],
      volume: ["ml", "l", "m3", "cm3", "gal", "ft3"],
      temperature: ["celsius", "fahrenheit", "kelvin"],
      pressure: ["pa", "kpa", "mpa", "bar", "atm", "psi", "kgfcm2", "kgfmm2", "mmhg"],
      force: ["n", "kn", "kgf", "tf", "lbf"],
      speed: ["mps", "mmin", "kmh", "mph", "knot"],
      energy: ["j", "kj", "kwh", "cal", "kcal"],
    });
  });

  it("단위 id 는 소문자·숫자뿐이고 전체에서 겹치지 않으며, 기준 단위·기본 단위가 표 안에 있다", () => {
    const ids = CATEGORIES.flatMap((c) => c.units.map((u) => u.id));
    expect(ids.every((id) => /^[a-z0-9]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CATEGORIES) {
      expect(findUnit(c.id, c.baseUnit), `${c.id} 기준 단위`).toBeDefined();
      expect(findUnit(c.id, c.defaultFrom), `${c.id} 기본 변환 전`).toBeDefined();
      expect(findUnit(c.id, c.defaultTo), `${c.id} 기본 변환 후`).toBeDefined();
      expect(c.defaultFrom).not.toBe(c.defaultTo);
    }
  });

  it("기준 단위는 계수 1·오프셋 0 이다", () => {
    for (const c of CATEGORIES) {
      const base = findUnit(c.id, c.baseUnit)!;
      expect(base.factor).toBe("1");
      expect(base.offset ?? "0").toBe("0");
    }
  });

  it("isCategoryId·findUnit·getCategory", () => {
    expect(isCategoryId("length")).toBe(true);
    expect(isCategoryId("Length")).toBe(false);
    expect(isCategoryId(undefined)).toBe(false);
    expect(findUnit("length", "zz")).toBeUndefined();
    expect(findUnit("length", 3)).toBeUndefined();
    expect(getCategory("mass").label).toBe("무게");
  });
});

describe("환산 — 스펙 값", () => {
  it("1 in = 25.4 mm", () => expect(conv("1", "length", "in", "mm")).toBe("25.4"));
  it("1 lb = 0.45359237 kg", () => expect(conv("1", "mass", "lb", "kg")).toBe("0.45359237"));
  it("1 평 = 3.305785124 m²", () => expect(conv("1", "area", "pyeong", "m2")).toBe("3.305785124"));
  it("100 °C = 212 °F = 373.15 K", () => {
    expect(conv("100", "temperature", "celsius", "fahrenheit")).toBe("212");
    expect(conv("100", "temperature", "celsius", "kelvin")).toBe("373.15");
    expect(conv("212", "temperature", "fahrenheit", "kelvin")).toBe("373.15");
    expect(conv("373.15", "temperature", "kelvin", "fahrenheit")).toBe("212");
  });
  it("-40 °C = -40 °F", () => {
    expect(conv("-40", "temperature", "celsius", "fahrenheit")).toBe("-40");
    expect(conv("-40", "temperature", "fahrenheit", "celsius")).toBe("-40");
  });
  it("1 MPa = 10.19716213 kgf/cm²", () => expect(conv("1", "pressure", "mpa", "kgfcm2")).toBe("10.19716213"));
  it("1 kgf = 9.80665 N", () => expect(conv("1", "force", "kgf", "n")).toBe("9.80665"));
  it("1 knot = 1.852 km/h", () => expect(conv("1", "speed", "knot", "kmh")).toBe("1.852"));
  it("1 kWh = 3,600,000 J", () => expect(conv("1", "energy", "kwh", "j")).toBe("3600000"));
});

describe("환산 — 그 밖의 계수", () => {
  it("길이", () => {
    expect(conv("1", "length", "ft", "in")).toBe("12");
    expect(conv("1", "length", "yd", "ft")).toBe("3");
    expect(conv("1", "length", "mi", "km")).toBe("1.609344");
    expect(conv("1", "length", "km", "mm")).toBe("1000000");
  });
  it("무게", () => {
    expect(conv("1", "mass", "t", "kg")).toBe("1000");
    expect(conv("1", "mass", "oz", "g")).toBe("28.34952313");
    expect(conv("1", "mass", "lb", "oz")).toBe("16");
  });
  it("면적", () => {
    expect(conv("1", "area", "ha", "m2")).toBe("10000");
    expect(conv("1", "area", "km2", "ha")).toBe("100");
    expect(conv("100", "area", "m2", "pyeong")).toBe("30.25");
    expect(conv("1", "area", "ft2", "in2")).toBe("144");
  });
  it("부피", () => {
    expect(conv("1", "volume", "m3", "l")).toBe("1000");
    expect(conv("1", "volume", "l", "ml")).toBe("1000");
    expect(conv("1", "volume", "ml", "cm3")).toBe("1");
    expect(conv("1", "volume", "gal", "l")).toBe("3.785411784");
    expect(conv("1", "volume", "ft3", "l")).toBe("28.31684659");
  });
  it("압력", () => {
    expect(conv("1", "pressure", "atm", "pa")).toBe("101325");
    expect(conv("1", "pressure", "bar", "kpa")).toBe("100");
    expect(conv("1", "pressure", "kgfmm2", "kgfcm2")).toBe("100");
    expect(conv("1", "pressure", "psi", "pa")).toBe("6894.757293");
    // 133.322387415 Pa 은 반올림한 값이라 760 mmHg 는 정확히 1 atm 이 아니다(101325.0144 Pa).
    expect(conv("760", "pressure", "mmhg", "atm")).toBe("1.000000142");
  });
  it("힘", () => {
    expect(conv("1", "force", "tf", "kn")).toBe("9.80665");
    expect(conv("1", "force", "kn", "n")).toBe("1000");
    expect(conv("1", "force", "lbf", "n")).toBe("4.448221615");
  });
  it("속도", () => {
    expect(conv("1", "speed", "kmh", "mps")).toBe("0.2777777778");
    expect(conv("60", "speed", "mmin", "mps")).toBe("1");
    expect(conv("1", "speed", "mph", "kmh")).toBe("1.609344");
  });
  it("에너지", () => {
    expect(conv("1", "energy", "kcal", "kj")).toBe("4.184");
    expect(conv("1", "energy", "cal", "j")).toBe("4.184");
    expect(conv("1", "energy", "kwh", "kcal")).toBe("860.4206501");
  });
  it("온도 — 0 °C = 32 °F = 273.15 K, 절대영도", () => {
    expect(conv("0", "temperature", "celsius", "fahrenheit")).toBe("32");
    expect(conv("0", "temperature", "celsius", "kelvin")).toBe("273.15");
    expect(conv("0", "temperature", "kelvin", "celsius")).toBe("-273.15");
    expect(conv("0", "temperature", "kelvin", "fahrenheit")).toBe("-459.67");
  });
});

describe("환산 — 같은 단위·왕복·음수", () => {
  it("같은 단위끼리는 그대로(오프셋 단위 포함)", () => {
    for (const c of CATEGORIES) {
      for (const u of c.units) expect(conv("123.456", c.id, u.id, u.id), `${c.id}/${u.id}`).toBe("123.456");
    }
  });

  it("왕복 변환(A→B→A)은 10자리 반올림 기준으로 원래 값으로 돌아온다 — 모든 분류의 모든 단위 쌍", () => {
    for (const c of CATEGORIES) {
      for (const a of c.units) {
        for (const b of c.units) {
          for (const v of ["123.456", "-7.5", "0.000123", "98765"]) {
            const there = convert(new D(v), c.id, a.id, b.id); // 중간값은 반올림하지 않는다(화면의 [⇄] 는 반올림한 값을 되먹이지만 그 경우는 별도 시험)
            const back = convert(there, c.id, b.id, a.id);
            expect(formatNumber(back, false), `${v} ${a.id}→${b.id}→${a.id}`).toBe(formatNumber(new D(v), false));
          }
        }
      }
    }
  });

  it("음수도 계산한다(모든 분류)", () => {
    expect(conv("-1", "length", "in", "mm")).toBe("-25.4");
    expect(conv("-1", "pressure", "mpa", "kgfcm2")).toBe("-10.19716213");
  });

  it("모르는 단위는 예외", () => {
    expect(() => convert(new D(1), "length", "in", "zz")).toThrow();
    expect(() => convert(new D(1), "length", "zz", "in")).toThrow();
    expect(() => convertAll(new D(1), "length", "zz")).toThrow();
  });
});

describe("convertAll", () => {
  it("분류의 모든 단위를 표 순서로 돌려주고 변환 전 단위 줄은 입력값이다", () => {
    const rows = convertAll(new D("2"), "length", "m");
    expect(rows.map((r) => r.unit.id)).toEqual(["mm", "cm", "m", "km", "in", "ft", "yd", "mi"]);
    expect(rows.map((r) => formatNumber(r.value, false))).toEqual(["2000", "200", "2", "0.002", "78.74015748", "6.56167979", "2.187226597", "0.001242742384"]);
  });
});

describe("절대영도 아래", () => {
  it("온도만 판정한다 — 경계 값은 아래가 아니다", () => {
    expect(isBelowAbsoluteZero(new D("-273.15"), "temperature", "celsius")).toBe(false);
    expect(isBelowAbsoluteZero(new D("-273.16"), "temperature", "celsius")).toBe(true);
    expect(isBelowAbsoluteZero(new D("-459.67"), "temperature", "fahrenheit")).toBe(false);
    expect(isBelowAbsoluteZero(new D("-459.68"), "temperature", "fahrenheit")).toBe(true);
    expect(isBelowAbsoluteZero(new D("-0.01"), "temperature", "kelvin")).toBe(true);
    expect(isBelowAbsoluteZero(new D("0"), "temperature", "kelvin")).toBe(false);
  });

  it("다른 분류는 음수여도 경고가 아니다", () => {
    expect(isBelowAbsoluteZero(new D("-500"), "length", "m")).toBe(false);
  });
});
