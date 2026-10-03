// codeConfirm api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchDrafts, unwrap, validateDraft, viewDraft } from "../../../pages/dmc/codeConfirm/api";
import {
  REJECT_ENVELOPE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("codeConfirm", {
  call: () => searchDrafts("k"),
  url: "/api/mdm/oasis/codeConfirm/search",
  menuId: "codeConfirm",
  merge: "result",
  reject: "meta-only",
  noGrids: true,
});

describe("codeConfirm — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("빈 ver 는 null 로 바꿔 빼고, 다른 빈 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await viewDraft("C1", "");
    await viewDraft("C1", null);
    await validateDraft("C1", "1.000", "");
    expect(calls.map((c) => c.body.params)).toEqual([
      { maruCodeId: "C1" },
      { maruCodeId: "C1" },
      { maruCodeId: "C1", ver: "1.000", applyFrom: "" },
    ]);
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error("거부 문구"));
  });
});
