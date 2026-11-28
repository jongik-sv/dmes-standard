import { describe, expect, it } from "vitest";
import { failureFromMessage } from "./api";
import { benchErrorText } from "./draft";
import { PermApplyError } from "./types";

describe("c5 c — 적용 거절 PERM_LAST_SYSADMIN·PERM_SELF_LOCKOUT", () => {
  it("서버 문구 「CODE: 상세」 를 코드로 읽는다", () => {
    const last = failureFromMessage("PERM_LAST_SYSADMIN: 적용하면 사용 중인 시스템관리자가 0명이 됩니다. 초안은 그대로 남습니다 (admin)");
    expect(last).toBeInstanceOf(PermApplyError);
    expect((last as PermApplyError).code).toBe("PERM_LAST_SYSADMIN");
    const self = failureFromMessage("PERM_SELF_LOCKOUT: 본인 계정의 시스템관리자 권한은 뺄 수 없습니다. 초안은 그대로 남습니다");
    expect((self as PermApplyError).code).toBe("PERM_SELF_LOCKOUT");
  });

  it("적용 모달 문구 — 초안이 남았다고 알리고 다시 읽기를 권하지 않는다", () => {
    const last = benchErrorText(new PermApplyError("PERM_LAST_SYSADMIN", "상세 (admin)"));
    expect(last.message).toContain("시스템관리자가 한 명도 남지 않아");
    expect(last.message).toContain("초안은 그대로");
    expect(last.message).toContain("(상세 (admin))");
    expect(last.reload).toBe(false);
    const self = benchErrorText(new PermApplyError("PERM_SELF_LOCKOUT", "x"));
    expect(self.message).toContain("본인 계정의 시스템관리자 권한");
    expect(self.reload).toBe(false);
  });
});
