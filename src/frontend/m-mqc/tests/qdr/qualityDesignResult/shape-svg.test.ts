import { describe, expect, it } from "vitest";

import {
  buildSummary,
  changeDetail,
  changeLine,
  coilLengths,
  fmtDelta,
  fmtMm,
  geoLine,
  layerColor,
  layerHeights,
  layerThkText,
  surfaceOf,
  tint,
  valueText,
  COLORS,
  SIZES,
} from "../../../src/qdr/qualityDesignResult/shape/svg";
import type { ShapeModel, ShapeScene } from "../../../src/qdr/qualityDesignResult/types";

function scene(id: ShapeScene["id"], thk: number | null, wid: number | null, extra: Partial<ShapeScene> = {}): ShapeScene {
  return {
    id,
    no: 1,
    title: id,
    process: null,
    geometry: { thkMm: thk, widMm: wid, idMm: null, weightT: null },
    layers: [{ id: "substrate", kind: "substrate", side: "core", thkUm: thk == null ? null : thk * 1000, label: "소지" }],
    values: [],
    changes: [],
    ...extra,
  };
}

const MODEL: ShapeModel = {
  productType: "CCGI",
  summary: "",
  warnings: [],
  scenes: [
    scene("raw", 1.8, 1507),
    scene("rolled", 0.43, 1503),
    scene("coated", 0.45, 1493, { values: [{ key: "coat_cd", label: "도금량코드", value: "E : 80 g/㎡", unit: null, formula: null, evidence: { kind: "constant", ruleId: null, ver: null, ruleKey: null, seq: null, screen: null, note: null } }] }),
    scene("product", 0.472, 1490),
  ],
};

describe("shape svg helpers", () => {
  it("fmtMm — 100 이상은 천 단위 정수", () => {
    expect(fmtMm(1507)).toBe("1,507");
    expect(fmtMm(0.43)).toBe("0.430");
    expect(fmtMm(null)).toBe("—");
  });

  it("fmtDelta — 빼기 기호와 정수", () => {
    expect(fmtDelta(-1.37)).toBe("−1.370");
    expect(fmtDelta(3)).toBe("+3");
    expect(fmtDelta(0)).toBe("0");
  });

  it("tint 는 흰색·검은색 쪽으로 섞는다", () => {
    expect(tint("#000000", 1)).toBe("#FFFFFF");
    expect(tint("#FFFFFF", -1)).toBe("#000000");
    expect(tint("#808080", 0)).toBe("#808080");
  });

  it("coilLengths — 폭에 비례하고 가장 넓은 것이 maxLen", () => {
    const l = coilLengths(MODEL, "sm");
    expect(l.raw).toBe(SIZES.sm.maxLen);
    expect(l.product).toBe(SIZES.sm.minLen);
    expect(l.rolled).toBeGreaterThan(l.coated);
    // 폭이 다른 장면끼리는 최소 6px 차이
    expect(l.coated - l.product).toBeGreaterThanOrEqual(6);
  });

  it("coilLengths — 폭이 모두 같으면 모두 maxLen", () => {
    const l = coilLengths({ scenes: [scene("raw", 1, 1000), scene("rolled", 1, 1000)] }, "lg");
    expect(l).toEqual({ raw: SIZES.lg.maxLen, rolled: SIZES.lg.maxLen });
  });

  it("layerHeights — 소지 46%, 나머지 로그 4~12", () => {
    const hs = layerHeights(
      [
        { kind: "zinc", thkUm: 12 },
        { kind: "substrate", thkUm: 430 },
        { kind: "topcoat", thkUm: null },
        { kind: "primer", thkUm: 100000 },
      ],
      84,
    );
    expect(hs).toEqual([Math.round(4 + 4 * Math.log10(12)), 39, 4, 12]);
  });

  it("층 색·두께 글·표면", () => {
    const raw = MODEL.scenes[0];
    expect(layerColor(raw.layers[0], raw)).toBe(COLORS.hot);
    expect(layerColor({ id: "c", kind: "az", side: "top", thkUm: 12, label: "AZ" })).toBe(COLORS.coating);
    expect(layerThkText(raw.layers[0])).toBe("1.800 mm");
    expect(layerThkText({ id: "c", kind: "zinc", side: "top", thkUm: 12, label: "Zn" })).toBe("12 µm");
    expect(surfaceOf(raw)).toBe("hot");
    expect(surfaceOf(scene("coated", 1, 1, { layers: [{ id: "t", kind: "zinc", side: "top", thkUm: 10, label: "" }] }))).toBe("coating");
  });

  it("띠 글·변화 글·요약", () => {
    expect(geoLine(MODEL.scenes[1])).toBe("Set 0.430 × 1,503");
    const s = scene("rolled", 0.43, 1503, {
      changes: [
        { key: "thk_mm", from: 1.8, to: 0.43, delta: -1.37, unit: "mm" },
        { key: "wid_mm", from: 1507, to: 1503, delta: -4, unit: "mm" },
        { key: "layers", from: 1, to: 3, delta: 2, unit: null },
      ],
    });
    expect(changeLine(s)).toBe("두께 −1.370 · 폭 −4 · 층 +2");
    expect(changeDetail(s)).toBe("두께 1.800 → 0.430 · 폭 1,507 → 1,503");
    expect(buildSummary(MODEL)).toBe("CCGI · 원자재 1.800×1,507 → Set 0.430×1,503 → E → 제품 0.472×1,490");
    expect(valueText(0.43, "mm")).toBe("0.430");
    expect(valueText(null, "mm")).toBe("");
  });
});
