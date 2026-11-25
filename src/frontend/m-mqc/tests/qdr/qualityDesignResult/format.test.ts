import { describe, expect, it, vi } from "vitest";

const openPortalPage = vi.fn();
vi.mock("@dk-oasis/shared/widget", () => ({ openPortalPage: (id: string) => openPortalPage(id) }));

const f = await import("../../../src/qdr/qualityDesignResult/format");

describe("format", () => {
  it("ruleRef 는 ID·버전·행 키를 잇는다", () => {
    expect(f.ruleRef("C10B2060", "1.000", "TS-008")).toBe("C10B2060 v1.000 · TS-008");
    expect(f.ruleRef("C10B1074", null, null, 3)).toBe("C10B1074 · 3행");
    expect(f.ruleRef(null)).toBe("");
  });

  it("verdictTone — 참고값은 회색", () => {
    expect(f.verdictTone("P")).toBe("success");
    expect(f.verdictTone("F")).toBe("danger");
    expect(f.verdictTone("C")).toBe("warning");
    expect(f.verdictTone(null)).toBe("neutral");
    expect(f.verdictTone("F", true)).toBe("neutral");
    expect(f.verdictText(null)).toBe("판정 불가");
  });

  it("portalPageId 는 화면 폴더를 붙인다", () => {
    expect(f.portalPageId("rollingThicknessSet")).toBe("mqc:qdm/rollingThicknessSet");
    expect(f.portalPageId("orderConsistency")).toBe("mqc:qdf/orderConsistency");
    expect(f.portalPageId("nope")).toBeNull();
    expect(f.screenTitle("lineWidthMargin")).toBe("폭마진량관리");
  });

  it("openScreen 은 포털 탭을 열고, 모르는 화면은 열지 않는다", () => {
    expect(f.openScreen("lineWidthShrinkage")).toBe(true);
    expect(openPortalPage).toHaveBeenCalledWith("mqc:qdm/lineWidthShrinkage");
    expect(f.openScreen(null)).toBe(false);
    expect(openPortalPage).toHaveBeenCalledTimes(1);
  });

  it("크기 글", () => {
    expect(f.fmtThk(0.45)).toBe("0.450");
    expect(f.fmtWid(1490)).toBe("1,490.0");
    expect(f.fmtThk(null)).toBe("—");
    expect(f.stageLabel({ no: 4, name: "생산 가부" })).toBe("④ 생산 가부");
  });

  it("evidenceTitle — catalog 에 없으면 서버 이름", () => {
    expect(f.evidenceTitle({ ruleId: "X_RULE", title: "엑스" })).toBe("엑스");
    expect(f.evidenceTitle({ ruleId: "X_RULE", title: "" })).toBe("X_RULE");
  });
});
