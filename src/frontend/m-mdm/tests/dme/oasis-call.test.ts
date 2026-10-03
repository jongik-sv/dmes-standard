// 쓰기 실패 안내 공용 판정(writeFailure) — 룰 화면(useRuleEdit)과 룰 상세(ruleMng RuleDetailPanel)가 같이 쓴다(ruleEdit 기능설계서 §6.2).
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONFLICT_MESSAGE, OasisCallError, callOasis, omitNullish, writeFailure } from "../../src/dme/oasis-call";
import {
  NOISY_PARAMS, NOISY_SENT, REJECT_ENVELOPE, SUCCESS_ENVELOPE, SUCCESS_OUT, rejectionOf, stubOasis,
} from "../helpers/oasis-envelope";

describe("writeFailure", () => {
  it("MDM001(row_version 충돌)은 서버 문구 대신 '다른 창에서 바뀌었습니다' 와 conflict 를 돌려준다", () => {
    expect(CONFLICT_MESSAGE).toBe("다른 창에서 바뀌었습니다. 다시 불러오세요");
    expect(writeFailure(new OasisCallError("다른 사용자가 수정했습니다. 다시 불러오세요", "MDM001"))).toEqual({
      conflict: true,
      message: CONFLICT_MESSAGE,
    });
    // 코드가 오지 않는 경로(HTTP 오류 본문 등)는 서버 문구로 본다.
    expect(writeFailure(new Error("다른 사용자가 수정했습니다. 다시 불러오세요"))).toEqual({ conflict: true, message: CONFLICT_MESSAGE });
  });

  it("그 밖의 거부는 서버 문구를 그대로 두고 conflict 가 아니다", () => {
    expect(writeFailure(new OasisCallError("룰명은 100자 이하여야 합니다", "MDM010"))).toEqual({
      conflict: false,
      message: "룰명은 100자 이하여야 합니다",
    });
    expect(writeFailure("network down")).toEqual({ conflict: false, message: "network down" });
  });
});

// 공통본 callOasis 의 현재 동작 고정(특성 시험) — shared 공통 계약의 기본값(append-dedup·data+result·nullish)이 이것이다.
describe("callOasis(공통본) — OASIS 호출 특성", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("요청은 POST /api/mdm/oasis/{serviceId}/{action}, meta.menuId=serviceId, grids 는 줄 때만 싣는다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await callOasis("ruleEdit", "view", { a: 1 });
    await callOasis("ruleEdit", "save", { a: 1 }, { items: { rows: [{ X: 1 }] } });
    expect(calls[0].url).toBe("/api/mdm/oasis/ruleEdit/view");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].body.meta).toEqual({ menuId: "ruleEdit" });
    expect("grids" in calls[0].body).toBe(false);
    expect(calls[1].body.grids).toEqual({ items: { rows: [{ X: 1 }] } });
  });

  it("params 는 null·undefined 만 뺀다", async () => {
    const calls = stubOasis(SUCCESS_ENVELOPE);
    await callOasis("ruleEdit", "view", { ...NOISY_PARAMS });
    expect(calls[0].body.params).toEqual(NOISY_SENT.nullish);
    expect(omitNullish({ ...NOISY_PARAMS })).toEqual(NOISY_SENT.nullish);
  });

  it("성공은 data 전체 위에 data.result(객체)를 덮어 편다(응답 grids 는 올리지 않는다)", async () => {
    stubOasis(SUCCESS_ENVELOPE);
    expect(await callOasis("ruleEdit", "view", {})).toEqual(SUCCESS_OUT["data+result"]);
    stubOasis({ meta: { success: true }, data: { result: [1] } });
    expect(await callOasis("ruleEdit", "view", {})).toEqual({ result: [1] });
  });

  it("거부는 OasisCallError — errors[] 를 붙이되 base 와 같은 문구와 message 없는 항목(field 만 있음)은 거른다", async () => {
    stubOasis(REJECT_ENVELOPE);
    const e = await rejectionOf(callOasis("ruleEdit", "save", {}));
    expect(e).toBeInstanceOf(OasisCallError);
    expect(e.name).toBe("OasisCallError");
    expect(e.message).toBe("거부 문구\n- F1: 칸 오류\n- java.lang.NullPointerException: boom");
    expect((e as OasisCallError).code).toBe("MDM001");
  });

  it("code 는 meta.code, 없으면 errors[] 의 첫 code, 둘 다 없으면 null 이다", async () => {
    stubOasis({ meta: { success: false, message: "m" }, errors: [{ message: "a" }, { code: "E9", message: "b" }, { code: "E10" }] });
    expect(((await rejectionOf(callOasis("s", "a", {}))) as OasisCallError).code).toBe("E9");
    stubOasis({ meta: { success: false, message: "m" } });
    const e = (await rejectionOf(callOasis("s", "a", {}))) as OasisCallError;
    expect(e.code).toBeNull();
    expect(e.message).toBe("m");
  });

  it("거부 문구가 비면 기본 문구다(errors[] 는 그 뒤에 붙는다)", async () => {
    stubOasis({ meta: { success: false, message: "  " }, errors: [{ message: "요청이 거부되었습니다." }, { message: "x" }] });
    expect((await rejectionOf(callOasis("s", "a", {}))).message).toBe("요청이 거부되었습니다.\n- x");
  });
});
