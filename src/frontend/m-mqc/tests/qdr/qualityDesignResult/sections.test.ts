import { describe, expect, it } from "vitest";

import { HEADS, bandColumns, bandRows, kv, leafCount, sectionOfPath, sectionSummary, stepName } from "../../../src/qdr/qualityDesignResult/sections";
import type { DesignDoc } from "../../../src/qdr/qualityDesignResult/types";

const D = {
  head: { buyer: "", spec: "", size: "", prd: "", use: "", mat: "", mat2: "", bom: "" },
  common: [
    ["품질설계상태", "B : 설계중", "b"],
    ["도금량코드", "E : 80 g/㎡"],
  ],
  mat: { bands: [[], [], ["사내사양", "", "", "205", "380", "270", "500", "22", "", "", "", "1T"]], spc: [] },
  tol: { tols: [], base: [["설계기준", "BMT", "0.442", "0.592", "1490", "1520", "0", "0"]], shape: [] },
  cgl: {
    lines: [],
    pltcm: [
      ["두께목표값", "0.43 (0.415 ~ 0.445)"],
      ["폭목표값(주공정)", "1493"],
    ],
    ops: [],
    coat: { min: 80, max: 120, target: 84, thk: 12, spangle: "", lv: "", skin: "", sizeT: "", sizeW: "" },
  },
  egl: null,
  post: { t2c: "", st: "", wMin: 1490, wMax: 1520, pack: "ARSX00 : 내수Coil", packMsg: "", qMsg: "" },
  color: null,
  route: { no: "1P-83-AX", rows: [["1", "1P - PLTCM", ""], ["2", "83 - 3CGL", ""]] },
  comp: { g1: [[], [], ["사내사양", "0.0200", "0.0800", "", "0.5000", "", "0.5000", "", "0.0300"]], g2: [] },
  trace: {},
} as unknown as DesignDoc;

describe("sections", () => {
  it("요약줄", () => {
    expect(sectionSummary("common", D)).toBe("B : 설계중 · 도금량 E");
    expect(sectionSummary("mat", D)).toBe("YP 205~380 · TS 270~500 · 굴곡 1T");
    expect(sectionSummary("tol", D)).toBe("설계기준 BMT 0.442~0.592 · 폭 1490~1520");
    expect(sectionSummary("cgl", D)).toBe("두께목표 0.43 (0.415 ~ 0.445) · 폭 1493 · 도금 80~120g/㎡");
    expect(sectionSummary("egl", D)).toBe("해당 없음");
    expect(sectionSummary("post", D)).toBe("제품폭범위 1490~1520 · ARSX00");
    expect(sectionSummary("color", D)).toBe("해당 없음");
    expect(sectionSummary("route", D)).toBe("PLTCM → 3CGL");
    expect(sectionSummary("comp", D)).toBe("C ≤ 0.0800 · Mn ≤ 0.5000 · P ≤ 0.0300");
    expect(sectionSummary("shape", D, { productType: "GI", summary: "요약", warnings: [], scenes: [] })).toBe("요약");
  });

  it("kv·stepName·sectionOfPath", () => {
    expect(kv(D.cgl.pltcm, "폭목표값(주공정)")).toBe("1493");
    expect(kv(D.cgl.pltcm, "없음")).toBe("");
    expect(stepName("85 - 5CGL")).toBe("5CGL");
    expect(stepName("PLTCM")).toBe("PLTCM");
    expect(sectionOfPath("cgl.lines.적정.1")).toBe("cgl");
    expect(sectionOfPath("head.bom")).toBe("common");
    expect(sectionOfPath("zzz")).toBeNull();
  });

  it("두 단 머리 — 잎 열 수와 키", () => {
    expect(leafCount(HEADS.matBands)).toBe(12);
    expect(leafCount(HEADS.colorMatrix)).toBe(9);
    const cols = bandColumns(HEADS.cglLines);
    expect(cols.map((c) => c.key)).toEqual(["c0", "c1", "c2", "g3", "c6"]);
    expect(cols[3].children?.map((c) => c.key)).toEqual(["c3", "c4", "c5"]);
    expect(cols[0].minWidth).toBe(84);
  });

  it("bandRows — 행 키와 글자 값", () => {
    expect(bandRows([["적정", 1.8, null]])).toEqual([{ _k: "0", c0: "적정", c1: "1.8", c2: "" }]);
    expect(bandRows(undefined)).toEqual([]);
  });
});
