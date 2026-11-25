import { beforeEach, describe, expect, it, vi } from "vitest";

const callOasis = vi.fn();
vi.mock("@/common/oasis", () => ({ callOasis: (...args: unknown[]) => callOasis(...args) }));

const api = await import("../../../src/qcd/designSimulation/api");

beforeEach(() => {
  callOasis.mockReset();
  callOasis.mockResolvedValue({});
});

describe("designSimulation api", () => {
  it("orderJson — 빈칸은 null, _ 키는 뺀다", () => {
    expect(JSON.parse(api.orderJson({ A: "1", B: "", C: null, _src: "oms" }))).toEqual({ A: "1", B: null, C: null });
  });

  it("run — 고친 주문이 있을 때만 orderJson 을 싣는다", async () => {
    await api.runCase("TC-014");
    expect(callOasis).toHaveBeenLastCalledWith("designSimulation", "run", { caseId: "TC-014" });
    await api.runCase("TC-014", { PRD_NM_CD: "3" });
    expect(callOasis).toHaveBeenLastCalledWith("designSimulation", "run", { caseId: "TC-014", orderJson: '{"PRD_NM_CD":"3"}' });
    await api.applyGolden("TC-014");
    expect(callOasis).toHaveBeenLastCalledWith("designSimulation", "apply", { caseId: "TC-014" });
  });

  it("save — 배열은 JSON 글, 새 케이스는 caseId 를 빼고 보낸다", () => {
    const p = api.saveParams({
      caseId: null,
      caseNm: "새 케이스",
      baseOrdRef: "D260831014-010",
      order: { A: "1" },
      pins: [{ path: "cgl.coat.min", label: "도금 하한", op: "=", val: "80" }],
      verdicts: [{ stage: 4, expect: "P" }],
    });
    expect(p).toEqual({
      caseNm: "새 케이스",
      baseOrdRef: "D260831014-010",
      orderJson: '{"A":"1"}',
      pinsJson: '[{"path":"cgl.coat.min","label":"도금 하한","op":"=","val":"80"}]',
      verdictsJson: '[{"stage":4,"expect":"P"}]',
    });
    expect(Object.values(p).every((v) => typeof v === "string")).toBe(true);
  });

  it("search·view·delete", async () => {
    await api.searchCases("");
    expect(callOasis).toHaveBeenLastCalledWith("designSimulation", "search", {});
    await api.viewCase("TC-021");
    expect(callOasis).toHaveBeenLastCalledWith("designSimulation", "view", { caseId: "TC-021" });
    callOasis.mockResolvedValueOnce({ caseId: "TC-101" });
    expect(await api.deleteCase("TC-101")).toBe("TC-101");
  });
});
