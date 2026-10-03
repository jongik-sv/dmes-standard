// dataMng api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
// unwrap 은 dataMng/edit-api.ts 가 쓰고, page.tsx 는 message.startsWith(ROW_VERSION_CONFLICT_PREFIX) 로 충돌을 본다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerDataMng, searchDataMng, unwrap } from "../../../pages/dmd/dataMng/api";
import {
  REJECT_ENVELOPE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("dataMng", {
  call: () => searchDataMng("D1", "이름", "S"),
  url: "/api/mdm/oasis/dataMng/search",
  menuId: "dataMng",
  merge: "result",
  reject: "meta-only",
  noGrids: true,
});

describe("dataMng — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined·빈 문자열(\"\")을 빼고, 공백 문자열은 남긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await searchDataMng(" ", "", "");
    await searchDataMng("D1", "", "  ");
    await registerDataMng({ maruDataId: " D1 ", maruDataName: "이름", description: "  ", codePattern: "", lvlCnt: "0" });
    expect(calls.map((c) => c.body.params)).toEqual([
      {},
      { maruDataId: "D1", status: "  " },
      { maruDataId: "D1", maruDataName: "이름", lvlCnt: 0 },
    ]);
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT.result);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error("거부 문구"));
  });
});
