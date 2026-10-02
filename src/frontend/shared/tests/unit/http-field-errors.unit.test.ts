/**
 * 서버 ErrorDetail → 그리드 `fieldErrors` 모양(spec §4 AgDataGrid fieldErrors, C9).
 *  - apiRequest 가 던지는 HttpError 에 본문 errors(grid·rowKey·rowIndex·field·code·message)를 그대로 싣는다.
 *  - toFieldErrors 는 HttpError·Cactus 봉투·배열을 받아 field 가 있는 항목만, grid 를 주면 그 그리드(또는 grid 없음) 것만 돌려준다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, apiRequest, toFieldErrors } from "../../src/http";

const ERRORS = [
  { grid: "notice", rowKey: "N1", rowIndex: 0, field: "TITLE", code: "E001", message: "공지 제목은(는) 필수입니다" },
  { grid: "notice", rowKey: null, rowIndex: 2, field: "CATEGORY", code: "E002", message: "분류은(는) 최대 240자입니다" },
  { grid: "other", rowKey: "X", rowIndex: 0, field: "A", code: "E002", message: "다른 그리드" },
  { grid: null, rowKey: null, rowIndex: null, field: null, code: "MDM_UNAVAILABLE", message: "MDM 정의를 받을 수 없어" },
  { grid: null, rowKey: null, rowIndex: 0, field: "TITLE", code: "E001", message: "폼 하나" },
];

describe("toFieldErrors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("배열·Cactus 봉투에서 field 있는 항목만 그리드 모양으로", () => {
    const fromArray = toFieldErrors(ERRORS);
    expect(fromArray).toEqual([
      { rowKey: "N1", rowIndex: 0, field: "TITLE", message: "공지 제목은(는) 필수입니다" },
      { rowIndex: 2, field: "CATEGORY", message: "분류은(는) 최대 240자입니다" },
      { rowKey: "X", rowIndex: 0, field: "A", message: "다른 그리드" },
      { rowIndex: 0, field: "TITLE", message: "폼 하나" },
    ]);
    expect(toFieldErrors({ meta: { success: false }, errors: ERRORS })).toEqual(fromArray);
  });

  it("grid 를 주면 그 그리드와 grid 없는 항목만", () => {
    expect(toFieldErrors(ERRORS, "notice").map((e) => e.field)).toEqual(["TITLE", "CATEGORY", "TITLE"]);
  });

  it("모르는 값·오류 없는 값은 빈 배열", () => {
    expect(toFieldErrors(null)).toEqual([]);
    expect(toFieldErrors(new Error("x"))).toEqual([]);
    expect(toFieldErrors({ errors: "x" })).toEqual([]);
    expect(toFieldErrors(new HttpError(400, "Bad Request", "x"))).toEqual([]);
  });

  it("숫자 rowKey 는 문자열로", () => {
    expect(toFieldErrors([{ rowKey: 7, field: "A", message: "m" }])).toEqual([{ rowKey: "7", field: "A", message: "m" }]);
  });

  it("apiRequest 가 던진 HttpError 에 본문 errors 가 실려 toFieldErrors 로 읽힌다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ meta: { success: false, code: "INVALID_VALUE", message: "입력값을 확인해주세요." }, errors: ERRORS }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    let caught: unknown;
    try {
      await apiRequest("/api/mls/oasis/noticeMgmt/save", { method: "POST", body: "{}" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    const err = caught as HttpError;
    expect(err.code).toBe("INVALID_VALUE");
    expect(err.errors?.[0]).toEqual(ERRORS[0]);
    // 기존 메시지 모양은 그대로(첫 문장 — 필드: 문구)
    expect(err.message.startsWith("입력값을 확인해주세요. — TITLE: 공지 제목은(는) 필수입니다")).toBe(true);
    expect(toFieldErrors(err, "notice")).toHaveLength(3);
  });
});
