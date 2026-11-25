import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("@dk-oasis/shared/http", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  unwrapOasis: (res: { data?: { result?: Record<string, unknown> } }) => ({
    ...(res.data?.result ?? {}),
  }),
}));

const {
  compactParams,
  confirmSpecs,
  runSimulation,
  saveAttr,
  saveSpecs,
  searchChanges,
  searchSpecs,
} = await import("../../../src/qdm/qualitySpec/api");

function lastCall(): {
  url: string;
  body: { meta: { menuId: string }; params: Record<string, string> };
} {
  const [url, init] = apiRequest.mock.calls.at(-1) as [
    string,
    { method: string; body: string },
  ];
  expect(init.method).toBe("POST");
  return { url, body: JSON.parse(init.body) };
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: { result: {} } });
});

describe("qualitySpec api", () => {
  it("빈 값은 params 에서 뺀다", () => {
    expect(
      compactParams({ a: "", b: " ", c: "x", d: undefined, e: null }),
    ).toEqual({ c: "x" });
  });

  it("search — meta.menuId 와 납작한 params, 응답 기본값", async () => {
    apiRequest.mockResolvedValue({
      data: {
        result: {
          specs: [{ specNo: "320104-L01" }],
          total: 25,
          counts: { DRAFT: 3 },
        },
      },
    });
    const out = await searchSpecs({
      status: "CONF",
      keyword: "",
      cusCd: "320104",
    });
    const { url, body } = lastCall();
    expect(url).toBe("/api/mqc/oasis/qualitySpec/search");
    expect(body).toEqual({
      meta: { menuId: "qualitySpec" },
      params: { status: "CONF", cusCd: "320104" },
    });
    expect(out.total).toBe(25);
    expect(out.counts).toEqual({ DRAFT: 3, CONF: 0, SENT: 0, FAIL: 0 });
    expect(out.allSpecNos).toEqual([]);
  });

  it("save — 수정은 specNo, 확정은 confirm=Y", async () => {
    await saveSpecs("고객사 = 1 | 광택 = 1", {
      specNo: "1-L01",
      confirm: true,
    });
    expect(lastCall().body.params).toEqual({
      text: "고객사 = 1 | 광택 = 1",
      specNo: "1-L01",
      confirm: "Y",
    });
    await saveSpecs("a\nb");
    expect(lastCall().body.params).toEqual({ text: "a\nb" });
  });

  it("confirm — 배열은 쉼표 목록 글자로 보낸다", async () => {
    await confirmSpecs(["1-L01", "1-L02"]);
    expect(lastCall()).toMatchObject({
      url: "/api/mqc/oasis/qualitySpec/confirm",
      body: { params: { specNos: "1-L01,1-L02" } },
    });
  });

  it("history — kind 를 붙인다", async () => {
    await searchChanges({ fromDt: "2026-08-01", specNo: "1-L01" });
    expect(lastCall()).toMatchObject({
      url: "/api/mqc/oasis/qualitySpec/history",
      body: {
        params: { kind: "CHANGE", fromDt: "2026-08-01", specNo: "1-L01" },
      },
    });
  });

  it("save ATTR — target·대문자 코드, DATE 는 자리수를 빼고 보낸다", async () => {
    await saveAttr({
      origAttrCd: null,
      attrCd: "hrd_val",
      attrNm: " 경도 ",
      kind: "COND",
      dataType: "DATE",
      dataLen: "5",
      unit: "",
      description: "",
      useYn: "Y",
    });
    expect(lastCall().body.params).toEqual({
      target: "ATTR",
      attrCd: "HRD_VAL",
      attrNm: "경도",
      kind: "COND",
      dataType: "DATE",
      useYn: "Y",
    });
  });

  it("run — 직접 넣은 주문은 attrsJson 글자로", async () => {
    apiRequest.mockResolvedValue({
      data: { result: { order: { ordNo: "X" } } },
    });
    await runSimulation({
      cusCd: "320104",
      prdNmCd: "L",
      attrs: { RAW_THK: "0.8" },
    });
    expect(lastCall().body.params).toEqual({
      cusCd: "320104",
      prdNmCd: "L",
      attrsJson: '{"RAW_THK":"0.8"}',
    });
  });

  it("run — 주문이 없으면 오류", async () => {
    await expect(runSimulation({ ordNo: "NOPE" })).rejects.toThrow(
      "주문을 찾을 수 없습니다.",
    );
  });
});
