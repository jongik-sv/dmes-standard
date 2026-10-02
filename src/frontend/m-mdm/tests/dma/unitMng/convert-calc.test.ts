import { describe, expect, it } from "vitest";
import {
  formatConvertedValue,
  fromUnitComboData,
  parseCalcValue,
  sameDimensionUnits,
  type UnitOption,
} from "../../../pages/dma/unitMng/types";

const units: UnitOption[] = [
  { unitCode: "KG", dimension: "MASS" },
  { unitCode: "G", dimension: "MASS" },
  { unitCode: "M", dimension: "LENGTH" },
];

describe("환산 계산기 순수 함수", () => {
  it("입력 단위 콤보는 전체 단위를 '코드 (차원)' 라벨로 낸다", () => {
    expect(fromUnitComboData(units)).toEqual([
      { value: "KG", label: "KG (질량)" },
      { value: "G", label: "G (질량)" },
      { value: "M", label: "M (길이)" },
    ]);
  });

  it("결과 단위는 입력 단위와 같은 차원만, 입력 단위가 없거나 목록에 없으면 빈 목록", () => {
    expect(sameDimensionUnits(units, "KG").map((u) => u.unitCode)).toEqual(["KG", "G"]);
    expect(sameDimensionUnits(units, "M").map((u) => u.unitCode)).toEqual(["M"]);
    expect(sameDimensionUnits(units, "")).toEqual([]);
    expect(sameDimensionUnits(units, "ZZ")).toEqual([]);
  });

  it("값은 공백·천 단위 쉼표를 걷어 서버로 보낼 문자열로 만든다", () => {
    expect(parseCalcValue("")).toEqual({ kind: "empty" });
    expect(parseCalcValue("   ")).toEqual({ kind: "empty" });
    expect(parseCalcValue(" 2,500 ")).toEqual({ kind: "ok", value: "2500" });
    expect(parseCalcValue("-0.5")).toEqual({ kind: "ok", value: "-0.5" });
    expect(parseCalcValue(".5")).toEqual({ kind: "ok", value: ".5" });
    expect(parseCalcValue("1e3")).toEqual({ kind: "invalid" });
    expect(parseCalcValue("12kg")).toEqual({ kind: "invalid" });
    expect(parseCalcValue("-")).toEqual({ kind: "invalid" });
  });

  it("환산값은 천 단위 쉼표를 붙이고 소수 자리는 자르지 않는다", () => {
    expect(formatConvertedValue(2500000)).toBe("2,500,000");
    expect(formatConvertedValue(2.5)).toBe("2.5");
    expect(formatConvertedValue(0.000123456)).toBe("0.000123456");
  });
});
