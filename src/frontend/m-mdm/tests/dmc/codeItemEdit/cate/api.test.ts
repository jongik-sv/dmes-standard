// codeItemEdit/cate api.ts(codeCateEdit 서비스)의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { previewRegex, revertCategory, unwrap, viewCategories } from "../../../../pages/dmc/codeItemEdit/cate/api";
import {
  REJECT_ENVELOPE, REJECT_MESSAGE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../../helpers/oasis-envelope";

describeOasisEnvelope("codeItemEdit/cate", {
  call: () => viewCategories("C1", "1.000"),
  url: "/api/mdm/oasis/codeCateEdit/view",
  menuId: "codeCateEdit",
  merge: "result",
  reject: "unified",
  labelled: { field: "defExpr", label: "정규식" },
  noGrids: true,
});

describe("codeItemEdit/cate — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined 는 빼고 빈 문자열은 남긴다(빈 ver 는 null 로 바꿔 뺀다)", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await viewCategories("C1", "");
    await revertCategory("C1", "1.000", 0, "CATE", "A");
    await previewRegex("C1", "1.000", null, "", "  ");
    expect(calls.map((c) => c.body.params)).toEqual([
      { maruCodeId: "C1" },
      { maruCodeId: "C1", ver: "1.000", rowVersion: 0, table: "CATE", cateId: "A" },
      { maruCodeId: "C1", ver: "1.000", defExpr: "", defTarget: "  " },
    ]);
    expect(calls.every((c) => !("grids" in c.body))).toBe(true);
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error(REJECT_MESSAGE.unified));
  });
});
