import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dk-oasis/shared/widget", () => ({ openPortalPage: () => {} }));

const { ShapeView } = await import("../../../src/qdr/qualityDesignResult/shape/ShapeView");
const { StageStrip } = await import("../../../src/qdr/qualityDesignResult/RunWidgets");
import type { ShapeModel, Stage } from "../../../src/qdr/qualityDesignResult/types";

const MODEL: ShapeModel = {
  productType: "GI",
  summary: "GI · 원자재 1.800×1,240 → Set 0.420×1,236",
  warnings: ["원자재강종 기준 미적중"],
  scenes: [
    {
      id: "raw",
      no: 1,
      title: "원자재",
      process: null,
      geometry: { thkMm: 1.8, widMm: 1240, idMm: null, weightT: null },
      layers: [{ id: "substrate", kind: "substrate", side: "core", thkUm: 1800, label: "핫코일 H32" }],
      values: [],
      changes: [],
    },
    {
      id: "rolled",
      no: 2,
      title: "압연",
      process: { code: "1P", name: "PLTCM" },
      geometry: { thkMm: 0.42, widMm: 1236, idMm: null, weightT: null },
      layers: [{ id: "substrate", kind: "substrate", side: "core", thkUm: 420, label: "냉연 소지" }],
      values: [
        {
          key: "set_thk",
          label: "X-Ray Set 두께",
          value: 0.42,
          unit: "mm",
          formula: "주문두께 + 보정(−0.020) → 0.005 눈금",
          evidence: { kind: "rule", ruleId: "C10B2060", ver: "1.000", ruleKey: "TS-069", seq: 69, screen: "rollingThicknessSet", note: null },
        },
        {
          key: "raw_cd",
          label: "원자재 코드",
          value: null,
          unit: null,
          formula: null,
          evidence: { kind: "missing", ruleId: "QD_RAW_MATERIAL_GRADE", ver: null, ruleKey: null, seq: null, screen: "rawMaterialGrade", note: "기준 없음" },
        },
      ],
      changes: [{ key: "thk_mm", from: 1.8, to: 0.42, delta: -1.38, unit: "mm" }],
    },
  ],
};

describe("ShapeView", () => {
  it("장면 띠·상세·근거 배지를 그린다(기본 압연)", () => {
    const html = renderToStaticMarkup(<ShapeView model={MODEL} />);
    expect(html).toContain('data-scene="raw"');
    expect(html).toContain('aria-selected="true" tabindex="0" data-scene="rolled"');
    expect(html).toContain("C10B2060 v1.000 · TS-069");
    expect(html).toContain("압연두께Set보정관리 →");
    expect(html).toContain("설계값 없음");
    expect(html).toContain("기준 없음");
    expect(html).toContain("단면 확대");
    expect(html).toContain("원자재강종 기준 미적중");
  });

  it("장면이 없으면 안내 글", () => {
    expect(renderToStaticMarkup(<ShapeView model={{ ...MODEL, scenes: [] }} />)).toContain("설계 형상이 없습니다");
  });
});

describe("StageStrip", () => {
  it("참고값·판정 글", () => {
    const stages = [
      { no: 4, key: "feasibility", name: "생산 가부", verdict: "F", summary: "3CGL -", blocked: true, advisory: false, screen: null, evidence: [], detail: {} },
      { no: 5, key: "spec", name: "품질사양 매칭", verdict: "P", summary: "2건", blocked: false, advisory: true, screen: null, evidence: [], detail: {} },
    ] as Stage[];
    const html = renderToStaticMarkup(<StageStrip stages={stages} />);
    expect(html).toContain("④ 생산 가부");
    expect(html).toContain("불통 · 3CGL -");
    expect(html).toContain("참고값 · 2건");
    expect(html).toContain("mqc-qd-stage no");
  });
});
