import { describe, expect, it } from "vitest";
import { fromUnitComboData, toUnitComboData, type UnitOption } from "../../../pages/dma/unitMng/types";

const units: UnitOption[] = [
  { unitCode: "KG", dimension: "MASS" },
  { unitCode: "G", dimension: "MASS" },
  { unitCode: "M", dimension: "LENGTH" },
];

describe("환산 미리보기 콤보 선택지", () => {
  it("입력 단위 콤보는 전체 단위를 '코드 (차원)' 라벨로 낸다", () => {
    expect(fromUnitComboData(units)).toEqual([
      { value: "KG", label: "KG (질량)" },
      { value: "G", label: "G (질량)" },
      { value: "M", label: "M (길이)" },
    ]);
  });

  it("표시 단위 콤보는 입력 단위와 같은 차원만 낸다", () => {
    expect(toUnitComboData(units, "KG").map((o) => o.value)).toEqual(["KG", "G"]);
    expect(toUnitComboData(units, "M").map((o) => o.value)).toEqual(["M"]);
  });

  it("입력 단위가 없거나 목록에 없으면 전체를 낸다", () => {
    expect(toUnitComboData(units, "")).toHaveLength(3);
    expect(toUnitComboData(units, "ZZ")).toHaveLength(3);
  });
});
