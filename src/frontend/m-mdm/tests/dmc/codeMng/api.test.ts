// codeMng api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
// callMdmOasis 는 codeMng/edit-api.ts 가 serviceId 를 바꿔 쓰고, page.tsx 는 message.startsWith("다른 사용자가 수정했습니다") 로 충돌을 본다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { callMdmOasis, registerCode, searchCodes, unwrap } from "../../../pages/dmc/codeMng/api";
import {
  REJECT_ENVELOPE, SUCCESS_ENVELOPE, SUCCESS_OUT, describeOasisEnvelope, rejectionOf, stubOasis,
} from "../../helpers/oasis-envelope";

describeOasisEnvelope("codeMng", {
  call: () => searchCodes("k", "S"),
  url: "/api/mdm/oasis/codeMng/search",
  menuId: "codeMng",
  merge: "data+result",
  reject: "meta-only",
  noGrids: true,
  noisy: { call: (p) => callMdmOasis("codeMng", "search", p), omit: "nullish" },
});

describe("codeMng — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("callMdmOasis 는 serviceId 로 경로와 menuId 를 정한다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await callMdmOasis("codeEdit", "view", { maruCodeId: "C1" });
    expect(calls[0].url).toBe("/api/mdm/oasis/codeEdit/view");
    expect(calls[0].body.meta).toEqual({ menuId: "codeEdit" });
    expect("grids" in calls[0].body).toBe(false);
  });

  it("검색어·상태가 비면 null 로 바꿔 빼고, 등록 설명이 비면 뺀다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await searchCodes("  ", "");
    await registerCode({ maruCodeId: " C1 ", maruCodeName: " 이름 ", description: "  ", lvlCnt: "2" } as never);
    expect(calls[0].body.params).toEqual({});
    expect(calls[1].body.params).toEqual({ maruCodeId: "C1", maruCodeName: "이름", lvlCnt: 2 });
  });

  it("충돌 문구는 거부 문구 그대로라 접두 판정이 된다", async () => {
    stubOasis({ meta: { success: false, message: "다른 사용자가 수정했습니다. 다시 불러오세요" }, errors: [{ message: "x" }] });
    const e = await rejectionOf(searchCodes("k", ""));
    expect(e.message.startsWith("다른 사용자가 수정했습니다")).toBe(true);
    expect(e.message).toBe("다른 사용자가 수정했습니다. 다시 불러오세요");
  });

  it("export 한 unwrap 도 같은 방식이다", () => {
    expect(unwrap(SUCCESS_ENVELOPE)).toEqual(SUCCESS_OUT["data+result"]);
    expect(() => unwrap(REJECT_ENVELOPE)).toThrow(new Error("거부 문구"));
  });
});
