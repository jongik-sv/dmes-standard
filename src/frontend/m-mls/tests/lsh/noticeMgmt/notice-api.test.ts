import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@dk-oasis/shared/http", () => {
  class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { apiRequest: (...args: unknown[]) => apiRequest(...args), HttpError };
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
