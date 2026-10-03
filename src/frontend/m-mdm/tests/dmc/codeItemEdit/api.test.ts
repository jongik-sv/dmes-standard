// codeItemEdit api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { patchRow, saveAll, searchCodes, unwrap, viewCode } from "../../../pages/dmc/codeItemEdit/api";
import type { PatchParams } from "../../../pages/dmc/codeItemEdit/types";
import {
  REJECT_ENVELOPE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("codeItemEdit", {
  call: () => searchCodes("k"),
  url: "/api/mdm/oasis/codeItemEdit/search",
  menuId: "codeItemEdit",
  merge: "result",
  reject: "meta-only",
  noGrids: true,
  noisy: { call: (p) => patchRow(p as unknown as PatchParams), omit: "nullish" },
});

describe("codeItemEdit — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("빈 ver 는 null 로 바꿔 뺀다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await viewCode("C1", "");
    expect(calls[0].body.params).toEqual({ maruCodeId: "C1" });
  });

  it("validate·save 는 rows·categories·members 세 grid 를 빈 배열이라도 보낸다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await saveAll("C1", "1.000", 2, { rows: [], categories: [{ cateId: "A" }], members: [] });
    expect(calls[0].url).toBe("/api/mdm/oasis/codeItemEdit/save");
    expect(calls[0].body.params).toEqual({ maruCodeId: "C1", ver: "1.000", rowVersion: 2 });
    expect(calls[0].body.grids).toEqual({
      rows: { rows: [] }, categories: { rows: [{ cateId: "A" }] }, members: { rows: [] },
    });
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error("거부 문구"));
  });
});
