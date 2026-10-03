// layoutConfirm api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmDraft, searchDrafts, unwrap, viewDraft } from "../../../pages/dmb/layoutConfirm/api";
import {
  REJECT_ENVELOPE, REJECT_MESSAGE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("layoutConfirm", {
  call: () => searchDrafts("k"),
  url: "/api/mdm/oasis/layoutConfirm/search",
  menuId: "layoutConfirm",
  merge: "result",
  reject: "unified",
  labelled: { field: "HEADER_LAYOUT_ID", label: "헤더" },
  noGrids: true,
});

describe("layoutConfirm — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined 는 빼고 빈 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await viewDraft(3, null);
    await viewDraft(3, "");
    await confirmDraft(3, "1.001", 0, "", false);
    expect(calls.map((c) => c.body.params)).toEqual([
      { layoutId: 3 },
      { layoutId: 3, ver: "" },
      { layoutId: 3, ver: "1.001", rowVersion: 0, applyFrom: "", warningsAcknowledged: false },
    ]);
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error(REJECT_MESSAGE.unified));
  });
});
