// unitMng api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
// 이 화면은 거부 때 errors[] 를 붙이되 base 와 같은 문구를 거르지 않는다(공통본 oasis-call.ts 와 다른 점).
import { afterEach, describe, expect, it, vi } from "vitest";

import { saveUnit, searchUnits } from "../../../pages/dma/unitMng/api";
import type { UnitForm } from "../../../pages/dma/unitMng/types";
import { SUCCESS_ENVELOPE, describeOasisEnvelope, rejectionOf, stubOasis } from "../../helpers/oasis-envelope";

describeOasisEnvelope("unitMng", {
  call: () => searchUnits("KG", "MASS"),
  url: "/api/mdm/oasis/unitMng/search",
  menuId: "unitMng",
  merge: "data+result",
  reject: "append",
  noGrids: true,
});

describe("unitMng — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined 는 빼고 빈 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await saveUnit({ unitCode: "KG", dimension: null, baseUnit: "", factor: undefined } as unknown as UnitForm);
    expect(calls[0].url).toBe("/api/mdm/oasis/unitMng/save");
    expect(calls[0].body.params).toEqual({ unitCode: "KG", baseUnit: "" });
  });

  it("errors[] 의 빈 message(field 없음)는 빠진다", async () => {
    stubOasis({ meta: { success: false, message: "단위가 존재합니다" }, errors: [{ message: "" }, {}, { message: "단위가 존재합니다" }] });
    expect((await rejectionOf(searchUnits("KG", ""))).message).toBe("단위가 존재합니다\n- 단위가 존재합니다");
  });

  it("errors[] 에 field 만 있고 message 가 없거나 빈·공백이면 'field: undefined' 를 만들지 않고 뺀다", async () => {
    stubOasis({
      meta: { success: false, message: "확인" },
      errors: [{ field: "UNIT_CODE" }, { field: "FACTOR", message: "" }, { field: "DIMENSION", message: "  " }, { message: " " }, { field: "F1", message: "칸 오류" }],
    });
    expect((await rejectionOf(searchUnits("KG", ""))).message).toBe("확인\n- F1: 칸 오류");
  });
});
