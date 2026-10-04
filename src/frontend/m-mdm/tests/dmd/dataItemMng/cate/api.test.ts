// dataItemMng/cate api.ts(dataCateEdit 서비스)의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerCategory, saveMembers, searchCategories, unwrap } from "../../../../pages/dmd/dataItemMng/cate/api";
import {
  REJECT_ENVELOPE, REJECT_MESSAGE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../../helpers/oasis-envelope";

describeOasisEnvelope("dataItemMng/cate", {
  call: () => searchCategories("PORT"),
  url: "/api/mdm/oasis/dataCateEdit/search",
  menuId: "dataCateEdit",
  merge: "result",
  reject: "unified",
  labelled: { field: "cateId", label: "ID" },
  noGrids: true,
});

describe("dataItemMng/cate — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null 은 빼고 빈 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await registerCategory("PORT", "A", "카테", "TABLE", null, null, "");
    expect(calls[0].url).toBe("/api/mdm/oasis/dataCateEdit/reg");
    expect(calls[0].body.params).toEqual({ maruDataId: "PORT", cateId: "A", cateName: "카테", defKind: "TABLE", description: "" });
  });

  it("소속 저장은 비지 않은 목록만 grid 로 보내고, 둘 다 비어도 grids 키는 빈 객체로 실린다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await saveMembers("PORT", "A", ["K1"], []);
    await saveMembers("PORT", "A", [], []);
    expect(calls[0].url).toBe("/api/mdm/oasis/dataCateEdit/save");
    expect(calls[0].body.params).toEqual({ maruDataId: "PORT", cateId: "A" });
    expect(calls[0].body.grids).toEqual({ addCodes: { rows: [{ code: "K1" }] } });
    expect(calls[1].body.grids).toEqual({});
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error(REJECT_MESSAGE.unified));
  });
});
