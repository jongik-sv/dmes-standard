import { beforeEach, describe, expect, it, vi } from "vitest";

const callOasis = vi.fn();
vi.mock("@/common/oasis", () => ({ callOasis: (...args: unknown[]) => callOasis(...args) }));

const api = await import("../../../src/qdr/qualityDesignResult/api");

beforeEach(() => {
  callOasis.mockReset();
  callOasis.mockResolvedValue({});
});

describe("qualityDesignResult api", () => {
  it("compactParams 는 빈 값을 뺀다", () => {
    expect(api.compactParams({ a: "x", b: "", c: "  ", d: undefined, e: null, f: 3 })).toEqual({ a: "x", f: "3" });
  });

  it("search 는 조건을 납작한 글자로 보낸다", async () => {
    await api.searchDesigns({ fromDt: "2026-08-30", toDt: "2026-08-31", prdNmCd: "", status: "CONF", keyword: " " });
    expect(callOasis).toHaveBeenCalledWith("qualityDesignResult", "search", { fromDt: "2026-08-30", toDt: "2026-08-31", status: "CONF" });
  });

  it("상태 동작은 orderKey 하나를 보낸다 — 보류는 cancel", async () => {
    await api.calculateDesign("D260831014-010");
    expect(callOasis).toHaveBeenLastCalledWith("qualityDesignResult", "calculate", { orderKey: "D260831014-010" });
    await api.confirmDesign("D260831014-010");
    expect(callOasis).toHaveBeenLastCalledWith("qualityDesignResult", "confirm", { orderKey: "D260831014-010" });
    await api.toggleHold("D260831014-010");
    expect(callOasis).toHaveBeenLastCalledWith("qualityDesignResult", "cancel", { orderKey: "D260831014-010" });
    await api.toggleHold("D260831014-010", "고객 확인");
    expect(callOasis).toHaveBeenLastCalledWith("qualityDesignResult", "cancel", { orderKey: "D260831014-010", note: "고객 확인" });
  });

  it("history 는 events 를 꺼낸다(없으면 빈 줄)", async () => {
    callOasis.mockResolvedValueOnce({ events: [{ histId: 1, action: "CALC" }] });
    expect(await api.designHistory("K")).toHaveLength(1);
    callOasis.mockResolvedValueOnce({});
    expect(await api.designHistory("K")).toEqual([]);
  });

  it("주문 조회는 공용 qcdOrder 서비스다", async () => {
    await api.searchOrders(undefined, "G", 200);
    expect(callOasis).toHaveBeenLastCalledWith("qcdOrder", "search", { prdNmCd: "G", limit: "200" });
    await api.viewOrder("D260831021-010");
    expect(callOasis).toHaveBeenLastCalledWith("qcdOrder", "view", { orderKey: "D260831021-010" });
  });
});
