import { describe, expect, it } from "vitest";
import { bizErrorText, parseBizError, stripBizCode } from "./biz-error";

describe("업무 오류 코드 접두 떼기", () => {
  it("코드 하나를 뗀다", () => {
    expect(bizErrorText(new Error("LAST_SYSADMIN: 사용 중인 시스템관리자가 한 명도 남지 않습니다"))).toBe(
      "사용 중인 시스템관리자가 한 명도 남지 않습니다",
    );
    expect(parseBizError("HR_LEAVE: 인사 휴직")).toEqual({ code: "HR_LEAVE", codes: ["HR_LEAVE"], text: "인사 휴직" });
  });

  it("겹친 코드(E010: LAST_SYSADMIN:)를 모두 뗀다", () => {
    expect(bizErrorText(new Error("E010: LAST_SYSADMIN: 시스템관리자가 남지 않습니다"))).toBe("시스템관리자가 남지 않습니다");
    expect(parseBizError("E010: LAST_SYSADMIN: x").codes).toEqual(["E010", "LAST_SYSADMIN"]);
  });

  it("여러 줄 상세는 그대로 둔다", () => {
    expect(stripBizCode("E010: LAST_SYSADMIN: 첫 줄\n둘째 줄")).toBe("첫 줄\n둘째 줄");
  });

  it("코드가 없으면 그대로, 비면 기본 문구", () => {
    expect(parseBizError("비활성 사유를 고르세요")).toEqual({ code: null, codes: [], text: "비활성 사유를 고르세요" });
    expect(stripBizCode("ORA-00001: unique")).toBe("ORA-00001: unique");
    expect(stripBizCode("Http 500: 실패")).toBe("Http 500: 실패");
    expect(bizErrorText(new Error(""), "실패")).toBe("실패");
    expect(bizErrorText(null, "실패")).toBe("실패");
    expect(bizErrorText("PERM_FORBIDDEN: 막힘")).toBe("막힘");
  });

  it("코드만 있고 문구가 없으면 원문을 둔다", () => {
    expect(stripBizCode("LAST_SYSADMIN:")).toBe("LAST_SYSADMIN:");
  });
});
