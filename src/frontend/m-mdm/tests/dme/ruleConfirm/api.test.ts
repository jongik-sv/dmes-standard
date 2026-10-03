// ruleConfirm api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchDrafts, unwrap, viewDraft } from "../../../pages/dme/ruleConfirm/api";
import {
  REJECT_ENVELOPE, REJECT_MESSAGE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("ruleConfirm", {
  call: () => searchDrafts("k"),
  url: "/api/mdm/oasis/ruleConfirm/search",
  menuId: "ruleConfirm",
  merge: "result",
  reject: "unified",
  noGrids: true,
});

describe("ruleConfirm — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined 는 빼고 빈 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await viewDraft("R1", null);
    await viewDraft("R1");
    await viewDraft("R1", "");
    expect(calls.map((c) => c.body.params)).toEqual([{ maruRuleId: "R1" }, { maruRuleId: "R1" }, { maruRuleId: "R1", ver: "" }]);
  });

  it("export 한 unwrap(ruleSetConfirm 이 씀)도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error(REJECT_MESSAGE.unified));
  });
});
