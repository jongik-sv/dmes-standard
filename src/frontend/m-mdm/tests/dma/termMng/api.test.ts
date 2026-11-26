// termMng api.ts 의 OASIS 호출 특성(현재 동작 고정) — 공통 계약으로 옮겨도 그대로 통과해야 한다.
// 거부 문구는 다른 MDM 화면과 같은 통일 형식이며, 유사어 추천은 AbortSignal 을 그대로 fetch 에 넘긴다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { recommend, saveTerm, searchTerms } from "../../../pages/dma/termMng/api";
import { parseRecoCount } from "../../../pages/dma/termMng/TermDetailPane";
import { emptyTermForm } from "../../../pages/dma/termMng/types";
import { SUCCESS_ENVELOPE, describeOasisEnvelope, stubOasis } from "../../helpers/oasis-envelope";

describeOasisEnvelope("termMng", {
  call: () => searchTerms("k", "", ""),
  url: "/api/mdm/oasis/termMng/search",
  menuId: "termMng",
  merge: "data+result",
  reject: "unified",
  noGrids: true,
});

describe("termMng — 화면별 차이", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null·undefined 는 빼고 빈 문자열은 남긴다(빈 senseNo 는 null 로 바꿔 뺀다)", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await saveTerm({ ...emptyTermForm(), termName: "두께" });
    expect(calls[0].url).toBe("/api/mdm/oasis/termMng/save");
    expect(calls[0].body.params).toEqual({
      termName: "두께", definition: "", context: "", engName: "", engAbbr: "", synonyms: "", aliases: "", systems: "",
      stdBasis: emptyTermForm().stdBasis,
    });
  });

  it("recommend 는 받은 AbortSignal 을 fetch 에 그대로 넘긴다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    const ac = new AbortController();
    await recommend(null, "두께", "", "THK", ac.signal);
    expect(calls[0].url).toBe("/api/mdm/oasis/termMng/compare");
    expect(calls[0].init.signal).toBe(ac.signal);
    expect(calls[0].body.params).toEqual({ termName: "두께", definition: "", engName: "THK" });
  });

  it("recommend 는 추천 개수를 주면 params 에 싣고, 비운 개수는 뺀다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await recommend(null, "두께", "", "", undefined, { stage1TopN: 3, stage2TopN: undefined });
    expect(calls[0].body.params).toEqual({ termName: "두께", definition: "", engName: "", stage1TopN: 3 });
  });

  it("parseRecoCount 는 1~100 정수만 받는다", () => {
    expect(parseRecoCount("1")).toBe(1);
    expect(parseRecoCount(" 100 ")).toBe(100);
    expect(parseRecoCount("0")).toBeUndefined();
    expect(parseRecoCount("101")).toBeUndefined();
    expect(parseRecoCount("2.5")).toBeUndefined();
    expect(parseRecoCount("")).toBeUndefined();
  });

  it("signal 을 주지 않으면 fetch 의 signal 은 undefined 다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await searchTerms("k", "", "");
    expect(calls[0].init.signal).toBeUndefined();
  });
});
