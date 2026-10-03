import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

// 나머지 export(공통 계약 unwrapOasis 등)는 진짜를 쓰고, apiRequest·HttpError 만 바꿔 끼운다.
vi.mock("@dk-oasis/shared/http", async (importOriginal) => {
  class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ...(await importOriginal<object>()), apiRequest: (...args: unknown[]) => apiRequest(...args), HttpError };
});

const api = await import("../../../pages/lsh/noticeMgmt/api");
const { HttpError } = (await import("@dk-oasis/shared/http")) as unknown as {
  HttpError: new (status: number, message: string) => Error;
};

const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as { body: string }).body);

describe("noticeMgmt api", () => {
  beforeEach(() => apiRequest.mockReset());

  it("조회 — 조회조건 6개를 params 로 보내고 data.result.list 를 편다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: true },
      data: { result: { list: [{ NOTICE_ID: "N1" }] } },
    });
    const out = await api.searchNotices({
      title: "점검",
      noticeStatus: "",
      postStartDt: "",
      postEndDt: "",
      noticeCategory: "URGENT",
      contentFormat: "MD",
    });
    expect(out.list).toEqual([{ NOTICE_ID: "N1" }]);
    expect(apiRequest.mock.calls[0][0]).toBe(
      "/api/mls/oasis/noticeMgmt/search",
    );
    expect(bodyOf(apiRequest.mock.calls[0]).params).toMatchObject({
      noticeCategory: "URGENT",
      contentFormat: "MD",
    });
  });

  it("저장 — grids.master.rows 에 TARGET_ROLES 배열을 그대로 싣는다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: true },
      data: { result: { list: [] } },
    });
    await api.saveNotices([
      {
        NOTICE_ID: "",
        TITLE: "t",
        CONTENT: "",
        NOTICE_STATUS: "DRAFT",
        CONTENT_FORMAT: "TEXT",
        NOTICE_CATEGORY: "NORMAL",
        PIN_YN: "N",
        POST_START_DT: "",
        POST_END_DT: "",
        TARGET_SCOPE: "ROLE",
        TARGET_ROLES: ["ADMIN"],
        rowStatus: "inserted",
      },
    ]);
    const body = bodyOf(apiRequest.mock.calls[0]);
    expect(body.params).toEqual({});
    expect(body.grids.master.rows[0].TARGET_ROLES).toEqual(["ADMIN"]);
  });

  it("업무 거부 — 필드 코드를 항목명으로 바꾸고 원문처럼 보이는 글은 버린다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: false, message: "입력값을 확인해주세요." },
      errors: [
        {
          field: "TARGET_ROLES",
          message: "게시 대상을 역할로 정했으면 역할을 하나 이상 고르세요.",
        },
        { field: "TITLE", message: "java.lang.NullPointerException: boom" },
      ],
    });
    const err = await api.saveNotices([]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(api.NoticeApiError);
    expect((err as Error).message).toBe(
      "입력값을 확인해주세요.\n- 대상 역할: 게시 대상을 역할로 정했으면 역할을 하나 이상 고르세요.",
    );
    expect((err as InstanceType<typeof api.NoticeApiError>).field).toBe(
      "TARGET_ROLES",
    );
    expect(api.toUserMessage(err, "fallback")).toBe((err as Error).message);
  });

  it("업무 거부 — errors 상세를 오류 객체에 실어 둔다(화면이 toFieldErrors 로 칸에 붙인다). 예외 원문 문구는 뺀다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: false, message: "입력값을 확인해주세요." },
      errors: [
        {
          grid: "master",
          rowIndex: 0,
          field: "TITLE",
          code: "INVALID_VALUE",
          message: "제목은(는) 최대 1000자입니다",
        },
        { field: "CONTENT", message: "java.lang.IllegalStateException: boom" },
        {
          code: "MDM_UNAVAILABLE",
          message: "MDM 정의를 받을 수 없어 검증하지 못했습니다.",
        },
      ],
    });
    const err = (await api
      .saveNotices([])
      .catch((e: unknown) => e)) as InstanceType<typeof api.NoticeApiError>;
    expect(err.errors).toEqual([
      {
        grid: "master",
        rowIndex: 0,
        field: "TITLE",
        code: "INVALID_VALUE",
        message: "제목은(는) 최대 1000자입니다",
      },
      {
        code: "MDM_UNAVAILABLE",
        message: "MDM 정의를 받을 수 없어 검증하지 못했습니다.",
      },
    ]);
  });

  it("업무 거부 메시지가 예외 원문이면 정해진 문장을 쓴다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: false, message: "SQLITE_CONSTRAINT: UNIQUE failed" },
    });
    const err = await api.saveNotices([]).catch((e: unknown) => e);
    expect((err as Error).message).toBe("요청이 거부되었습니다.");
  });

  it("그 밖의 오류는 원문 대신 fallback, 403 은 권한 문장", () => {
    expect(
      api.toUserMessage(
        new Error("TypeError: x is undefined"),
        "저장하지 못했습니다.",
      ),
    ).toBe("저장하지 못했습니다.");
    expect(
      api.toUserMessage(new HttpError(403, "HTTP 403 — detail"), "f"),
    ).toBe("이 작업을 할 권한이 없습니다.");
  });

  it("역할 목록 — 사용 중만 요청하고 ds_main 을 읽는다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: true },
      data: {
        result: {
          ds_main: [
            { ROLE_ID: "ADMIN", ROLE_NM: "관리자" },
            { ROLE_ID: "", ROLE_NM: "빈 값" },
          ],
        },
      },
    });
    const roles = await api.searchRoles();
    expect(apiRequest.mock.calls[0][0]).toBe(
      "/api/mcm/oasis/commRoleMng/search",
    );
    expect(bodyOf(apiRequest.mock.calls[0]).params).toEqual({ cboUSETP: "Y" });
    expect(roles).toEqual([
      { ROLE_ID: "ADMIN", ROLE_NM: "관리자", ROLE_DESC: null },
    ]);
  });
});

// 공통 계약(@dk-oasis/shared/http)으로 옮기기 전 현재 동작 고정(특성 시험) — 옮긴 뒤에도 그대로 통과해야 한다.
describe("noticeMgmt api — OASIS 호출 특성(현재 동작 고정)", () => {
  beforeEach(() => apiRequest.mockReset());

  const REJECT = {
    meta: { success: false, message: "  거부 문구  ", code: "MDM001" },
    errors: [
      { field: "F1", code: "E1", message: "칸 오류" },
      { message: "거부 문구" },
      { field: "F2" },
      { message: "java.lang.NullPointerException: boom" },
    ],
  };

  it("요청은 POST, meta 는 menuId 하나, params 는 거르지 않고(null·빈 문자열도 싣는다) grids 는 줄 때만 싣는다", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true } });
    await api.changeNoticeStatus("N1", null as unknown as string);
    await api.searchNotices({
      title: "", noticeStatus: "  ", postStartDt: "", postEndDt: "", noticeCategory: "", contentFormat: "",
    });
    const [url, init] = apiRequest.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/mls/oasis/noticeMgmt/changeStatus");
    expect(init.method).toBe("POST");
    expect(Object.keys(init).sort()).toEqual(["body", "method"]);
    const body = bodyOf(apiRequest.mock.calls[0]);
    expect(body).toEqual({ meta: { menuId: "noticeMgmt" }, params: { noticeId: "N1", noticeStatus: null } });
    expect(bodyOf(apiRequest.mock.calls[1]).params).toEqual({
      title: "", noticeStatus: "  ", postStartDt: "", postEndDt: "", noticeCategory: "", contentFormat: "",
    });
  });

  it("역할 목록은 다른 서비스 경로지만 menuId 는 화면 ID(noticeMgmt)다", async () => {
    apiRequest.mockResolvedValue({ meta: { success: true } });
    await api.searchRoles();
    expect(apiRequest.mock.calls[0][0]).toBe("/api/mcm/oasis/commRoleMng/search");
    expect(bodyOf(apiRequest.mock.calls[0]).meta).toEqual({ menuId: "noticeMgmt" });
  });

  it("성공은 data 전체 위에 data.result(객체)를 덮고, 응답 grids 의 rows 를 이름대로 올린다(rows 가 없으면 빈 배열)", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: true },
      data: { result: { a: 1, shared: "result" }, other: 2, shared: "data" },
      grids: { g: { rows: [{ k: 1 }] }, empty: {} },
    });
    expect(await api.changeNoticeStatus("N1", "STOP")).toEqual({
      result: { a: 1, shared: "result" }, other: 2, shared: "result", a: 1, g: [{ k: 1 }], empty: [],
    });
    apiRequest.mockResolvedValue({ data: { result: [1] } });
    expect(await api.changeNoticeStatus("N1", "STOP")).toEqual({ result: [1] });
  });

  it("거부는 NoticeApiError — 사용자 문장인 errors 만 붙이고(base 에 든 문구는 뺌), 항목명이 없는 field 는 글만 쓴다", async () => {
    apiRequest.mockResolvedValue(REJECT);
    const e = (await api.changeNoticeStatus("N1", "STOP").catch((x: unknown) => x)) as InstanceType<typeof api.NoticeApiError>;
    expect(Object.getPrototypeOf(e)).toBe(api.NoticeApiError.prototype);
    expect(e.name).toBe("NoticeApiError");
    expect(e.message).toBe("거부 문구\n- 칸 오류");
    expect(e.field).toBe("F1");
    expect(e.errors).toEqual([{ field: "F1", code: "E1", message: "칸 오류" }, { message: "거부 문구" }]);
    expect("code" in e).toBe(false);
  });

  it("field 는 소문자여도 대문자로 항목명을 찾고, field 는 예외 원문 오류에서도 첫 것을 쓴다", async () => {
    apiRequest.mockResolvedValue({
      meta: { success: false, message: "확인" },
      errors: [{ field: "CONTENT", message: "java.lang.IllegalStateException: x" }, { field: "title", message: "필수입니다" }],
    });
    const e = (await api.changeNoticeStatus("N1", "STOP").catch((x: unknown) => x)) as InstanceType<typeof api.NoticeApiError>;
    expect(e.message).toBe("확인\n- 제목: 필수입니다");
    expect(e.field).toBe("CONTENT");
    expect(e.errors).toEqual([{ field: "title", message: "필수입니다" }]);
  });

  it("기본 문구에 이미 들어 있는 상세는 다시 붙이지 않는다(포함 판정). errors 원본은 그대로 싣는다", async () => {
    const errors = [
      { grid: "master", rowIndex: 0, field: "TITLE", code: "REQUIRED_VALUE", message: "제목은 필수입니다" },
      { grid: "master", rowIndex: 0, field: "POST_END_DT", code: "INVALID_VALUE", message: "게시종료일이 게시시작일보다 빠릅니다" },
    ];
    apiRequest.mockResolvedValue({ meta: { success: false, message: "입력값을 확인해주세요: 제목은 필수입니다" }, errors });
    const e = (await api.changeNoticeStatus("N1", "STOP").catch((x: unknown) => x)) as InstanceType<typeof api.NoticeApiError>;
    expect(e.message).toBe("입력값을 확인해주세요: 제목은 필수입니다\n- 게시종료일: 게시종료일이 게시시작일보다 빠릅니다");
    expect(e.field).toBe("TITLE");
    expect(e.errors).toEqual(errors);
  });

  it("거부 문구가 비거나 공백·예외 원문이면 기본 문구다", async () => {
    for (const message of [undefined, "   ", "ORA-00001: unique constraint"]) {
      apiRequest.mockResolvedValue({ meta: { success: false, message } });
      const e = (await api.changeNoticeStatus("N1", "STOP").catch((x: unknown) => x)) as InstanceType<typeof api.NoticeApiError>;
      expect(e.message).toBe("요청이 거부되었습니다.");
      expect(e.field).toBeUndefined();
      expect(e.errors).toEqual([]);
    }
  });
});
