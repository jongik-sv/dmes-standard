import { describe, expect, it } from "vitest";
import { changeNotice, parseLoginError } from "../../src/auth/login-reason";
import { validatePassword } from "../../src/auth/PasswordChangeModal";
import { LOGIN_REASON_CODES, readLoginRejected } from "../../src/auth/server";

// 2026-11-28 — 시안 「사용자 비활성화·퇴직 처리」: 로그인 화면 안내 문구·첫 로그인 변경 창·비밀번호 규칙(D11)
describe("login reason", () => {
  it("코드|문구 를 읽고, 모르는 모양은 일반 실패 문구로 바꾼다", () => {
    expect(parseLoginError("A011|비밀번호를 바꾼 뒤 로그인하세요")).toEqual({
      code: "A011",
      message: "비밀번호를 바꾼 뒤 로그인하세요",
    });
    expect(parseLoginError("CredentialsSignin")).toEqual({
      code: null,
      message: "아이디 또는 비밀번호가 올바르지 않습니다.",
    });
    expect(parseLoginError(undefined).code).toBeNull();
    expect(parseLoginError("XX|조작된 문구").code).toBeNull();
  });

  it("변경 창 안내 — 사용 기간 지남은 서버 문구, 임시 비밀번호는 고정 문구", () => {
    expect(changeNotice("A012", "비밀번호 사용 기간(90일)이 지났습니다.")).toContain("90일");
    expect(changeNotice("A011", "무시")).toContain("임시 비밀번호");
  });

  it("BE 거절 본문에서 넘길 코드만 고른다 — A004(일반 실패)는 넘기지 않는다", async () => {
    const res = (body: unknown) => new Response(JSON.stringify(body), { status: 403 });
    expect(await readLoginRejected(res({ success: false, errorCode: "A011", message: "바꾸세요" }))).toEqual({
      rejected: true,
      code: "A011",
      message: "바꾸세요",
    });
    expect(await readLoginRejected(res({ success: false, errorCode: "A004", message: "틀림" }))).toBeNull();
    expect(await readLoginRejected(res({ meta: { code: "A005", message: "잠김|x" } }))).toEqual({
      rejected: true,
      code: "A005",
      message: "잠김 x",
    });
    expect(LOGIN_REASON_CODES.has("A013")).toBe(true);
  });

  it("비밀번호 규칙 — 8자 이상, 영문과 숫자(특수문자는 요구하지 않는다)", () => {
    expect(validatePassword("abc12")).toBe("8자 이상 입력해주세요");
    expect(validatePassword("12345678")).toBe("영문자를 포함해주세요");
    expect(validatePassword("abcdefgh")).toBe("숫자를 포함해주세요");
    expect(validatePassword("abcd1234")).toBeNull();
  });
});
