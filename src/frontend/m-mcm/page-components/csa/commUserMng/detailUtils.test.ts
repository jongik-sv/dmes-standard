import { describe, expect, it } from "vitest";
import { locksSelf, todayYmd } from "./detailUtils";

const TODAY = "20261128";

describe("c5 a — 본인 계정 잠금 막기(locksSelf)", () => {
  it("본인 행 삭제 = 잠금(대소문자 무시)", () => {
    expect(locksSelf({ USER_ID: "Admin", nativeeditor_status: "deleted" }, "admin", TODAY)).toBe(true);
  });

  it("본인 행 종료일 어제·시작일 내일 = 잠금, 종료일 오늘 = 허용", () => {
    expect(locksSelf({ USER_ID: "admin", END_ACTIVE_DATE: "2026-11-27", nativeeditor_status: "updated" }, "admin", TODAY)).toBe(true);
    expect(locksSelf({ USER_ID: "admin", START_ACTIVE_DATE: "20261129", nativeeditor_status: "updated" }, "admin", TODAY)).toBe(true);
    expect(locksSelf({ USER_ID: "admin", END_ACTIVE_DATE: "2026-11-28T00:00:00", nativeeditor_status: "updated" }, "admin", TODAY)).toBe(false);
  });

  it("남의 행·로그인 정보 없음·안 바뀐 줄은 보지 않는다", () => {
    expect(locksSelf({ USER_ID: "u1", nativeeditor_status: "deleted" }, "admin", TODAY)).toBe(false);
    expect(locksSelf({ USER_ID: "admin", nativeeditor_status: "deleted" }, "", TODAY)).toBe(false);
    expect(locksSelf({ USER_ID: "admin", END_ACTIVE_DATE: "2020-01-01", nativeeditor_status: "" }, "admin", TODAY)).toBe(false);
  });

  it("todayYmd", () => {
    expect(todayYmd(new Date("2026-11-27T15:30:00Z"))).toBe("20261128"); // KST 00:30
  });
});
