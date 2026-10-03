// 쓰기 실패 안내 공용 판정(writeFailure) — 룰 화면(useRuleEdit)과 룰 상세(ruleMng RuleDetailPanel)가 같이 쓴다(ruleEdit 기능설계서 §6.2).
import { describe, expect, it } from "vitest";

import { CONFLICT_MESSAGE, OasisCallError, writeFailure } from "../../src/dme/oasis-call";

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
